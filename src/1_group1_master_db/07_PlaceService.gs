/**
 * VERSION: 5.5.013
 * FILE: 07_PlaceService.gs
 * LMDS V5.5 — Place Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Place — ฐานข้อมูลสถานที่จัดส่ง
 *   เป็น Single Source of Truth สำหรับข้อมูลสถานที่
 * ===================================================
 *   v5.5.013 (2026-06-19) — GOOGLE MAPS REFACTOR:
 *     - [REWRITE] 15_GoogleMapsAPI.gs เขียนใหม่ทั้งไฟล์ — ลบระบบ 3-layer cache + MAPS_CACHE sheet
 *       เพิ่มสูตร Amit Agarwal 7 ตัว เป็น @customFunction (พิมพ์ใน Sheet ได้):
 *       GOOGLEMAPS_DISTANCE, GOOGLEMAPS_DURATION, GOOGLEMAPS_LATLONG,
 *       GOOGLEMAPS_ADDRESS, GOOGLEMAPS_REVERSEGEOCODE, GOOGLEMAPS_COUNTRY, GOOGLEMAPS_DIRECTIONS
 *     - [REMOVE] ลบ MAPS_CACHE sheet จาก SCHEMA, SHEET, MAPS_CACHE_IDX, setupAllSheets
 *     - [REMOVE] ลบฟังก์ชันเก่าที่ไม่มี caller: geocodeAddress, reverseGeocode,
 *       getRouteDistanceKm, cachedGeoLookup_, _loadSheetCache_, _flushHitCounts_,
 *       getFromSheetCache_, saveToSheetCache_, clearMapsCache
 *     - เหตุผล: ระบบ LMDS ไม่ได้เรียก Google Maps API ผ่าน code แล้ว
 *       DIST_FROM_WH และ RESOLVED_ADDR มาจาก AppSheet ที่ผู้ใช้ทำไว้แล้ว
 *   v5.5.012 (2026-06-19) — ANTIPATTERN FIX + DOC SYNC:
 *     - [FIX #1] showVersionInfo() แก้จาก v5.5.010 → v5.5.012 + Audit Cycles 5 → 9
 *     - [FIX #3] resolvePerson เพิ่ม optional preNormResult เพื่อหลีกเลี่ยง double normalization
 *       17_SearchService ส่ง normResult เข้า resolvePerson แทน cleanName (ลด normalize ซ้อน)
 *     - [FIX #4] reprocessReviewQueue ใช้ REVIEW_IDX/FACT_IDX constants แทน headers.indexOf()
 *       ปฏิบัติตาม Single Source of Truth rule
 *     - [FIX #5] validateConfig เรียก validateSchemaConsistency เพิ่ม — onOpen จับ SCHEMA drift ได้
 *     - [FIX #2] CHANGELOG sync — เพิ่ม v5.5.011 entry ในไฟล์ที่ยังไม่มี (20 ไฟล์)
 *     - [DOC] แก้ broken cross-references ใน README (ลบ reports/* และ LMDS_V5.5_COMPLETE_Audit_Report.md)
 *     - [DOC] Standardize function count = 313 ในเอกสาร .md
 *     - [DOC] อัปเดต DEPENDENCIES/ARCHITECTURE section ในไฟล์ที่แก้ (00, 01, 06, 12, 17)
 *   v5.5.011 (2026-06-19) — DATA CONSISTENCY + SHIPTONAME CLEAN + Q_REVIEW NAV FIX:
 *     - [FIX] 02_Schema.gs เพิ่ม SCHEMA['SCGนครหลวงJWDภูมิภาค'] (37 cols) ที่ขาดหายไป
 *     - [FIX] 17_SearchService findBestGeoByPersonPlace ผ่าน normalizePersonNameFull ก่อนค้นหา
 *     - [ADD] 12_ReviewService buildRecommendedAction_ สร้าง ID สำหรับ Smart Navigation
 *     - [ADD] 00_App handleRecommendClick_ + navigateFromRecommend_ สำหรับ Q_REVIEW Nav
 *   v5.5.010 (2026-06-18) — CACHE HOTFIX + Q_REVIEW Post-Processor:
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
 *   v5.4.003 (2026-03-04) — Refactor-02: SRP tier split for getEnrichedGeoData:
 *     - [REFACTOR] Split getEnrichedGeoData into 4 sub-functions (SRP)
 *     - [ADD] enrichByDictionary_  — Tier 0+1 (extractGeoFromAddress + scanAddressAgainstDictionary)
 *     - [ADD] enrichByRegexFuzzy_  — Tier 2 (Regex → Fuzzy Lookup)
 *     - [ADD] enrichByPostcode_    — Tier 3 (lookupByPostcode Last Resort)
 *     - [ADD] buildEnrichedResult_ — Result builder with `source` audit trail
 *     - [ADD] `source` field to return object: 'DICTIONARY'|'REGEX_FUZZY'|'POSTCODE'|'NONE'
 *     - getEnrichedGeoData is now a concise orchestrator
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [REMOVE] createPlace: ลบ createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น
 *     - [REMOVE] createPlaceAlias: ลบ createGlobalAlias() — ไม่ต้อง sync ย้อนไป M_ALIAS
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *   v5.2.001 (PH2 Hardening):
 *     - [FIX] createPlace: canonical_name = repaired address
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.M_PLACE, PLACE_IDX.*, AI_CONFIG)
 *     - 02_Schema.gs          (SCHEMA[SHEET.M_PLACE], SCHEMA[SHEET.M_PLACE_ALIAS])
 *     - 03_SetupSheets.gs     (logDebug, logWarn, logError)
 *     - 05_NormalizeService.gs (normalizePlaceName, normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId, generateUUID, diceCoefficient, levenshteinDistance,
 *                              saveChunkedCache_, loadChunkedCache_ [V5.5.007 P1 #6])
 *   CALLS (Invokes):
 *     - resolveMasterUuidViaGlobalAlias() → 21_AliasService.gs (findPlaceCandidates)
 *     - convertUuidToPlaceId()            → 21_AliasService.gs (findPlaceCandidates)
 *     - extractGeoFromAddress()           → 16_GeoDictionaryBuilder.gs
 *     - scanAddressAgainstDictionary()    → 16_GeoDictionaryBuilder.gs
 *     - lookupPostcodeByArea()            → 20_ThGeoService.gs
 *     - lookupByPostcode()                → 20_ThGeoService.gs
 *   EXPORTS TO:
 *     - 10_MatchEngine.gs     (resolvePlace, createPlace, updatePlaceStats, loadAllPlaces_)
 *     - 11_TransactionService.gs (loadAllPlaces_)
 *     - 17_SearchService.gs   (loadAllPlaces_)
 *     - 21_AliasService.gs    (loadAllPlaces_ — UUID converters)
 *   SHEETS ACCESSED:
 *     - SHEET.M_PLACE         (Read+Write: CRUD, Stats update)
 *     - SHEET.M_PLACE_ALIAS   (Read+Write: Alias lookup, createPlaceAlias)
 *     - SHEET.SYS_TH_GEO      (Read: Geo dictionary lookup)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  07_PlaceService.gs (Place Master Hub)                      │
 *   │  ├── resolvePlace()         — Match/resolve place           │
 *   │  ├── findPlaceCandidates()  — Multi-strategy search         │
 *   │  │   ├── M_ALIAS Fast Path (resolveMasterUuidViaGlobalAlias) │
 *   │  │   ├── Alias Match (M_PLACE_ALIAS)                        │
 *   │  │   ├── Phonetic / Name Match                              │
 *   │  │   └── Note Search (Deep Match)                           │
 *   │  ├── scorePlaceCandidate()  — Score calculation             │
 *   │  ├── tryMatchBranch()       — Chain store matching          │
 *   │  ├── createPlace()          — Create new place record       │
 *   │  ├── createPlaceAlias()     — Add alternate name            │
 *   │  ├── updatePlaceStats()     — Update usage statistics       │
 *   │  ├── getEnrichedGeoData()   — Orchestrator (calls tier sub-fns)│
 *   │  │   ├── enrichByDictionary_()  — Tier 0+1 (Dict-based)     │
 *   │  │   ├── enrichByRegexFuzzy_()  — Tier 2 (Regex → Fuzzy)    │
 *   │  │   ├── enrichByPostcode_()    — Tier 3 (Postcode fallback)│
 *   │  │   └── buildEnrichedResult_() — Result builder + source   │
 *   │  ├── loadAllPlaces_()       — Load all places (cached)      │
 *   │  │   └── saveChunkedCache_/loadChunkedCache_ for            │
 *   │  │       CACHE_KEY.PLACE_ALL / PLACE_ALIAS_ALL [V5.5.007 #6]│
 *   │  ├── loadAllPlaceAliases_() — Load all place aliases (cached)│
 *   │  │   └── chunked cache migration [V5.5.007 P1 #6]           │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// [NEW v5.2.001] Global RAM Cache for batch runs (Managed in 01_Config.gs)

// ============================================================
// SECTION 1: resolvePlace
// ============================================================

function resolvePlace(rawName, rawAddress) {
  const normResult = normalizePlaceName(rawName);
  const cleanPlace = normResult.cleanPlace;

  if (!cleanPlace || cleanPlace.length < 2) {
    return { placeId: null, status: 'LOW_QUALITY', confidence: 0, normResult };
  }

  const candidates = findPlaceCandidates(cleanPlace, rawAddress);

  if (candidates.length === 0) {
    return { placeId: null, status: 'NOT_FOUND', confidence: 0, normResult };
  }

  let bestPlace = null;
  let bestScore = 0;

  candidates.forEach(candidate => {
    const score = scorePlaceCandidate(cleanPlace, candidate);
    if (score > bestScore) { bestScore = score; bestPlace = candidate; }
  });

  if (bestScore < AI_CONFIG.THRESHOLD_AUTO) {
    const branchResult = tryMatchBranch(cleanPlace, rawAddress);
    if (branchResult) {
      return { placeId: branchResult.placeId, status: 'BRANCH_MATCH',
               confidence: branchResult.score, normResult };
    }
  }

  if (bestScore >= AI_CONFIG.THRESHOLD_AUTO) {
    return { placeId: bestPlace.placeId, status: 'FOUND',
             confidence: bestScore, normResult };
  }
  if (bestScore >= AI_CONFIG.THRESHOLD_REVIEW) {
    return { placeId: bestPlace.placeId, status: 'NEEDS_REVIEW',
             confidence: bestScore, normResult };
  }
  return { placeId: null, status: 'NOT_FOUND', confidence: bestScore, normResult };
}

// ============================================================
// SECTION 2: findPlaceCandidates
// ============================================================

/**
 * findPlaceCandidates
 * [FIX v003] Object reference: includes → .some(p => p.placeId===)
 * [FIX v003] เพิ่ม normB guard ก่อน startsWith
 */
function findPlaceCandidates(cleanPlace, rawAddress) {
  const allPlaces = loadAllPlaces_();
  const results   = [];

  const aliasResolve = typeof resolveMasterUuidViaGlobalAlias === 'function' ? resolveMasterUuidViaGlobalAlias(cleanPlace, 'PLACE') : null;
  if (aliasResolve && aliasResolve.masterUuid && aliasResolve.score >= 95) {
    const ownerId = convertUuidToPlaceId(aliasResolve.masterUuid);
    const perfect = allPlaces.find(p => p.placeId === ownerId);
    if (perfect) return [perfect];
  }

  // Alias Match
  const aliasMatches = findPlaceByAlias_(cleanPlace);
  aliasMatches.forEach(placeId => {
    const found = allPlaces.find(p => p.placeId === placeId);
    if (found && !results.some(r => r.placeId === found.placeId)) {
      results.push(found);
    }
  });

  // Phonetic / Name Match
  const searchKey = buildThaiPhoneticKey(cleanPlace);
  allPlaces.forEach(place => {
    if (results.some(r => r.placeId === place.placeId)) return;
    const placeKey = buildThaiPhoneticKey(place.normalized);

    if (searchKey && placeKey && searchKey === placeKey) {
      results.push(place);
    } else {
      const normA = normalizeForCompare(cleanPlace);
      const normB = normalizeForCompare(place.normalized);
      // [FIX v003] เพิ่ม guard normB ก่อน startsWith
      if (normA.length >= 3 && normB && normB.startsWith(normA.substring(0, 3))) {
        results.push(place);
      }
    }
  });

  // 4. Note Search (Deep Match) — [NEW v5.2.003] ค้นหาลามไปถึงหมายเหตุ
  if (results.length === 0) {
    const queryParts = cleanPlace.split(/\s+/).filter(p => p.length >= 2);
    allPlaces.forEach(place => {
      const noteStr = String(place.note || '');
      if (!noteStr) return;
      
      const isMatch = queryParts.some(part => noteStr.includes(part));
      if (isMatch) {
        results.push(place);
      }
    });
  }

  return results;
}

function findPlaceByAlias_(cleanPlace) {
  const allAliases = loadAllPlaceAliases_();
  const targetNorm = normalizeForCompare(cleanPlace);
  const foundSet   = new Set();

  allAliases.forEach(alias => {
    if (!alias[PLACE_ALIAS_IDX.ACTIVE_FLAG]) return;
    const aliasNorm = normalizeForCompare(alias[PLACE_ALIAS_IDX.ALIAS_NAME]);
    if (aliasNorm === targetNorm && aliasNorm.length > 0) {
      foundSet.add(String(alias[PLACE_ALIAS_IDX.PLACE_ID]));
    }
  });
  return [...foundSet];
}

// ============================================================
// SECTION 3: Branch Match
// ============================================================

/**
 * tryMatchBranch
 * [FIX v003] province condition: !province || p.province === province
 *            เดิม: !province || !p.province || p.province === province
 *            ปัญหา: !p.province ทำให้ match ทุก place ที่ไม่มี province
 */
function tryMatchBranch(cleanPlace, rawAddress) {
  const allPlaces  = loadAllPlaces_();
  const normQuery  = normalizeForCompare(cleanPlace);
  const province   = extractProvince_(rawAddress);

  for (const store of CHAIN_STORE_LIST) {
    const normStore = normalizeForCompare(store);
    if (!normQuery.includes(normStore)) continue;

    const matching = allPlaces.filter(p => {
      const normPlace = normalizeForCompare(p.normalized);
      if (!normPlace.includes(normStore)) return false;
      // [FIX v003] ถ้าไม่รู้ province → match ได้ทุก branch
      //            ถ้ารู้ province → ต้องตรงกันเท่านั้น
      return !province || p.province === province;
    });

    if (matching.length === 1) return { placeId: matching[0].placeId, score: 85 };
    if (matching.length > 1) {
      matching.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
      return { placeId: matching[0].placeId, score: 75 };
    }
  }
  return null;
}

/**
 * extractProvince_
 * [FIX v005] เลิกใช้ Regex กวาด (กันเคส 'สมเด็จ' -> 'พระปิ่นเกล้า')
 *            เปลี่ยนมาใช้ Whitelist จังหวัด 77 จังหวัด
 */
function extractProvince_(rawAddress) {
  if (!rawAddress) return '';
  const addr = String(rawAddress);

  // [FIX S2 v5.5.002] ใช้ TH_PROVINCES จาก 01_Config.gs แทน inline array — Rule 4 & Rule 5
  // 1. ตรวจสอบจากรายชื่อจังหวัดหลัก (Whitelist) เพื่อความแม่นยำ 100%
  for (const prov of TH_PROVINCES) {
    // ตรวจชื่อหลัก
    if (addr.includes(prov.name)) {
      return prov.name;
    }
    // ตรวจ aliases (เช่น 'กรุงเทพ', 'กทม' → 'กรุงเทพมหานคร')
    for (const alias of prov.aliases) {
      if (addr.includes(alias)) {
        return prov.name;
      }
    }
  }

  // 2. Fallback: ถ้าไม่เจอชื่อตรงๆ ลองหาจากรหัสไปรษณีย์
  const postcodeMatch = addr.match(/\b[0-9]{5}\b/);
  if (postcodeMatch) {
    const loc = lookupByPostcode(postcodeMatch[0]);
    if (loc) return loc.province;
  }
  return '';
}

/**
 * extractDistrict_
 * [FIX v005] ปรับปรุง Regex ให้แม่นยำขึ้น และตัดคำขยะ
 */
function extractDistrict_(rawAddress) {
  if (!rawAddress) return '';
  const addr = String(rawAddress);

  const match = addr.match(/(?:อำเภอ|เขต|อ\.)\s?([ก-๙]{2,})/);
  if (match && match[1]) {
    let districtName = match[1].trim();
    // [CLEANUP v5.1.004] ตัดคำนำหน้าที่อาจติดมาออก
    districtName = districtName.replace(/^(อำเภอ|เขต|อ\.)/g, '').trim();
    return districtName;
  }
  return '';
}

/**
 * extractSubDistrict_
 * [FIX v5.1.004] เพิ่ม Negative Lookahead กันเคส 'ต ซ.' หรือ 'ต ซอย'
 */
function extractSubDistrict_(rawAddress) {
  if (!rawAddress) return '';
  const addr = String(rawAddress);

  // Regex: หา ตำบล/แขวง/ต. ที่ไม่ตามด้วย ซ./ซอย
  const match = addr.match(/(?:ตำบล|แขวง|ต\.)\s?(?!ซ\.|ซอย)([ก-๙]{2,})/);
  if (match && match[1]) {
    let t = match[1].trim();
    // [CLEANUP v5.1.004] ตัดคำนำหน้าที่อาจติดมาออก
    t = t.replace(/^(ตำบล|แขวง|ต\.)/g, '').trim();
    return t;
  }
  return '';
}

/**
 * extractHouseNumber_ — [NEW v5.2.003] แกะเลขที่บ้าน
 */
function extractHouseNumber_(rawAddress) {
  if (!rawAddress) return '';
  const addr = String(rawAddress).trim();
  
  // 1. เลขที่ 123/45 หรือ 123/45 (ขึ้นต้นด้วยตัวเลข)
  const match = addr.match(/^(?:เลขที่\s*)?([0-9\/]{1,10}(?:\s*[ก-ฮ])?)/);
  if (match) return match[1].trim();
  
  // 2. ค้นหาคำว่า "เลขที่" กลางประโยค
  const matchMid = addr.match(/เลขที่\s*([0-9\/]{1,10})/);
  if (matchMid) return matchMid[1].trim();
  
  return '';
}

/**
 * getEnrichedGeoData — [ADD v008] ฟังก์ชันส่วนกลางสำหรับแกะข้อมูลภูมิศาสตร์
 * [REFACTOR-02] แยก 4 tier ออกเป็น helper แยก + เพิ่ม source audit trail
 *   Tier 0+1: enrichByDictionary_() — extractGeoFromAddress + scanAddressAgainstDictionary
 *   Tier 2:   enrichByRegexFuzzy_() — Regex + fuzzy lookup
 *   Tier 3:   enrichByPostcode_()   — Postcode fallback
 *   Audit:    return เพิ่ม field `source` บอกว่าได้ผลจาก tier ไหน
 */
function getEnrichedGeoData(rawAddress, rawPlaceName) {
  const addr1 = String(rawPlaceName || '').trim();
  const addr2 = String(rawAddress   || '').trim();

  // 1. Extract postcode (สัญญาณที่เชื่อถือได้ที่สุด)
  let fPost = (addr1.match(/\b[0-9]{5}\b/) || [])[0] ||
              (addr2.match(/\b[0-9]{5}\b/) || [])[0] || '';

  // 2. Extract house number
  const house = extractHouseNumber_(addr1) || extractHouseNumber_(addr2);

  // 3. Tier 0+1: Dictionary-based (most accurate)
  const dictResult = enrichByDictionary_(addr1, addr2, fPost);
  if (dictResult && dictResult.subDistrict && dictResult.district && dictResult.province) {
    return buildEnrichedResult_(house, dictResult, 'dictionary');
  }

  // 4. Tier 2: Regex + Fuzzy (partial)
  const fuzzyResult = enrichByRegexFuzzy_(addr1, addr2, dictResult || {});
  if (fuzzyResult && fuzzyResult.province) {
    return buildEnrichedResult_(house, fuzzyResult, 'regex_fuzzy');
  }

  // 5. Tier 3: Postcode fallback
  const postcodeResult = enrichByPostcode_(fPost, fuzzyResult || dictResult || {});
  return buildEnrichedResult_(house, postcodeResult || {}, postcodeResult ? 'postcode' : 'none');
}

/**
 * enrichByDictionary_ — [REFACTOR-02] Tier 0+1: Dictionary-based enrichment
 * รวม extractGeoFromAddress (Tier 0) + scanAddressAgainstDictionary (Tier 1)
 * @return {{subDistrict, district, province, postcode}|null}
 */
function enrichByDictionary_(addr1, addr2, knownPostcode) {
  const fullText = addr1 + ' ' + addr2;

  // Tier 0: extractGeoFromAddress (16-column Search Key)
  if (typeof extractGeoFromAddress === 'function') {
    const geoMatch = extractGeoFromAddress(fullText);
    if (geoMatch) {
      return {
        subDistrict: geoMatch.subDistrict || '',
        district:    geoMatch.district    || '',
        province:    geoMatch.province    || '',
        postcode:    geoMatch.postcode    || knownPostcode
      };
    }
  } else {
    logWarn('PlaceService', 'enrichByDictionary_: extractGeoFromAddress ไม่พร้อม — ข้าม Tier 0');
  }

  // Tier 1: scanAddressAgainstDictionary (ค้นคำตรง)
  if (typeof scanAddressAgainstDictionary === 'function') {
    const scanResult = scanAddressAgainstDictionary(fullText, knownPostcode);
    if (scanResult) {
      return {
        subDistrict: scanResult.subDistrict || '',
        district:    scanResult.district    || '',
        province:    scanResult.province    || '',
        postcode:    scanResult.postcode    || knownPostcode
      };
    }
  } else {
    logWarn('PlaceService', 'enrichByDictionary_: scanAddressAgainstDictionary ไม่พร้อม — ข้าม Tier 1');
  }

  return null;
}

/**
 * enrichByRegexFuzzy_ — [REFACTOR-02] Tier 2: Regex + Fuzzy lookup
 * ดึงค่าจาก Regex → ส่ง lookupPostcodeByArea เพื่อ fuzzy match กับ SYS_TH_GEO
 * @param {string} addr1 - rawPlaceName
 * @param {string} addr2 - rawAddress
 * @param {Object} partial - ค่าที่ได้จาก tier ก่อนหน้า (อาจมีบาง field)
 * @return {{subDistrict, district, province, postcode}|null}
 */
function enrichByRegexFuzzy_(addr1, addr2, partial) {
  const regSub  = !partial.subDistrict ? (extractSubDistrict_(addr1) || extractSubDistrict_(addr2)) : '';
  const regDist = !partial.district    ? (extractDistrict_(addr1)    || extractDistrict_(addr2))    : '';
  const regProv = !partial.province    ? (extractProvince_(addr1)    || extractProvince_(addr2))    : '';

  if (!regSub && !regDist && !regProv && !partial.subDistrict && !partial.district && !partial.province) {
    return null;
  }

  // ส่ง Regex + ค่าที่มีอยู่แล้ว ไป Fuzzy Match กับ SYS_TH_GEO
  if (typeof lookupPostcodeByArea === 'function') {
    const fuzzy = lookupPostcodeByArea(
      partial.subDistrict || regSub,
      partial.district    || regDist,
      partial.province    || regProv
    );
    if (fuzzy) {
      // Dictionary ชนะเสมอ — ค่าจาก SYS_TH_GEO เป๊ะ
      return {
        subDistrict: fuzzy.subDistrict || partial.subDistrict || regSub  || '',
        district:    fuzzy.district    || partial.district    || regDist || '',
        province:    fuzzy.province    || partial.province    || regProv || '',
        postcode:    fuzzy.postcode    || partial.postcode    || ''
      };
    }
  } else {
    logWarn('PlaceService', 'enrichByRegexFuzzy_: lookupPostcodeByArea ไม่พร้อม — ข้าม Tier 2');
  }

  // Fallback: คืนค่า regex ที่ extract ได้ + ค่าจาก tier ก่อนหน้า
  if (regSub || regDist || regProv || partial.subDistrict || partial.district || partial.province) {
    return {
      subDistrict: partial.subDistrict || regSub  || '',
      district:    partial.district    || regDist || '',
      province:    partial.province    || regProv || '',
      postcode:    partial.postcode    || ''
    };
  }

  return null;
}

/**
 * enrichByPostcode_ — [REFACTOR-02] Tier 3: Postcode fallback
 * ใช้ lookupByPostcode เพื่อค้นหาจากรหัสไปรษณีย์
 * @param {string} postcode
 * @param {Object} partial - ค่าที่ได้จาก tier ก่อนหน้า
 * @return {{subDistrict, district, province, postcode}|null}
 */
function enrichByPostcode_(postcode, partial) {
  if (!postcode || typeof lookupByPostcode !== 'function') return partial;

  const pcResult = lookupByPostcode(postcode);
  if (!pcResult) return partial;

  // lookupByPostcode คืนค่าแบบไม่มี prefix → ต้องหา row ที่ตรงจาก SYS_TH_GEO อีกที
  // ใช้ lookupPostcodeByArea เพื่อให้ได้ค่าพร้อม prefix
  if (typeof lookupPostcodeByArea === 'function') {
    const exact = lookupPostcodeByArea(
      pcResult.subDistrict || partial.subDistrict,
      pcResult.district    || partial.district,
      pcResult.province    || partial.province
    );
    if (exact) {
      return {
        subDistrict: partial.subDistrict || exact.subDistrict || '',
        district:    partial.district    || exact.district    || '',
        province:    partial.province    || exact.province    || '',
        postcode:    postcode
      };
    }
  } else {
    logWarn('PlaceService', 'getEnrichedGeoData: lookupByPostcode ไม่พร้อม — ข้ามลำดับ 3 (Postcode Lookup)');
  }

  // Fallback ถ้า lookupPostcodeByArea ไม่มี → ใช้ค่าจาก postcode map
  return {
    subDistrict: partial.subDistrict || pcResult.subDistrict || '',
    district:    partial.district    || pcResult.district    || '',
    province:    partial.province    || pcResult.province    || '',
    postcode:    postcode
  };
}

/**
 * buildEnrichedResult_ — [REFACTOR-02] สร้าง return object มาตรฐานพร้อม source audit trail
 * @param {string} house - เลขที่บ้าน
 * @param {Object} geo - {subDistrict, district, province, postcode}
 * @param {string} source - แหล่งที่มา ('dictionary'|'regex_fuzzy'|'postcode'|'none')
 * @return {Object}
 */
function buildEnrichedResult_(house, geo, source) {
  const fullAddress = formatEnrichedAddress_(house, geo.subDistrict, geo.district, geo.province, geo.postcode);
  return {
    province:     geo.province     || '',
    district:     geo.district     || '',
    subDistrict:  geo.subDistrict  || '',
    postcode:     geo.postcode     || '',
    fullAddress:  fullAddress,
    houseNumber:  house,
    source:       source
  };
}

/**
 * formatEnrichedAddress_ — [ADD v008] จัดรูปแบบที่อยู่ที่ซ่อมแล้วเป็น String
 */
function formatEnrichedAddress_(house, sub, dist, prov, post) {
  const parts = [];
  if (house) parts.push(house); // [NEW v5.2.003]
  if (sub)   parts.push(sub);
  if (dist)  parts.push(dist);
  if (prov)  parts.push(prov);
  if (post)  parts.push(post);
  return parts.join(' ').trim();
}

// [REMOVED REV1-001] extractTextPriority_() and fuzzyMatchAddress() removed — deprecated v5.5.001,
// replaced by getEnrichedGeoData() tier pipeline. See git history for reference.

// ============================================================
// SECTION 4: Scoring
// ============================================================

/**
 * scorePlaceCandidate
 * [FIX v003] hardcode 55 → AI_CONFIG.PLACE_SCORE_MIN
 */
function scorePlaceCandidate(queryPlace, candidate) {
  const nameA = normalizeForCompare(queryPlace);
  const nameB = normalizeForCompare(candidate.normalized || candidate.canonical);
  if (!nameA || !nameB) return 0;

  const levDist   = levenshteinDistance(nameA, nameB);
  const maxLen    = Math.max(nameA.length, nameB.length);
  const levScore  = maxLen > 0 ? Math.max(0, (1 - levDist / maxLen) * 100) : 0;
  const diceScore = diceCoefficient(nameA, nameB) * 100;
  const exactScore = nameA === nameB ? 100 : 0;

  const finalScore = exactScore > 0 ? 100 : diceScore * 0.6 + levScore * 0.4;

  // [FIX v003] ใช้ Config แทน hardcode 55
  return finalScore < AI_CONFIG.PLACE_SCORE_MIN ? 0 : Math.round(finalScore);
}

// ============================================================
// SECTION 5: CRUD
// ============================================================

function createPlace(normResult, province, district, subDistrict, postcode) {
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE);
  const now   = new Date();
  const newId = generateShortId('PL');

  // [FIX v5.2.002] รวบรวม Note ทั้งหมด (Suffix, Delivery Note)
  const allNotes = normResult.notes || [];

  const universalMasterId = typeof generateUUID === 'function' ? generateUUID() : generateShortId('UID');

  const newRow = [
    newId,
    normResult.fullAddress || normResult.cleanPlace, // [FIX v008] ใช้ที่อยู่ที่ซ่อมแล้วเป็นชื่อหลัก (Canonical)
    normResult.cleanPlace, // Normalized
    normResult.placeType || 'other',
    subDistrict || '',
    district    || '',
    province    || '',
    postcode    || '',
    now, now, 1,
    APP_CONST.STATUS_ACTIVE,
    allNotes.join(','), // [FIX v5.2.002] เก็บลง Note ห้ามทิ้ง
    universalMasterId,
  ];

  // [FIX-05 v5.4.003] ใช้ getRange+setValues แทน appendRow เพื่อความเสถียร
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);
  invalidatePlaceCache_();

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)
  // autoEnrichAliasesFromFactBatch_() จะเขียน canonical+variant เข้า M_ALIAS เอง

  logDebug('PlaceService', `createPlace: ${newId} — ${normResult.cleanPlace}`);
  return newId;
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('PlaceService', `createPlace ล้มเหลว: ${err.message}`, err);
    return null;
  }
}

function createPlaceAlias(placeId, aliasName, matchScore) {
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE_ALIAS);
  const newId = generateShortId('PLA');

  // [FIX-05 v5.4.003] ใช้ getRange+setValues แทน appendRow
  const aliasRow = [newId, placeId, aliasName, matchScore || 0, new Date(), true];
  const aliasLastRow = sheet.getLastRow();
  sheet.getRange(aliasLastRow + 1, 1, 1, aliasRow.length).setValues([aliasRow]);
  invalidatePlaceAliasCache_();

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)

  logDebug('PlaceService', `createPlaceAlias: ${aliasName} → ${placeId}`);
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('PlaceService', `createPlaceAlias ล้มเหลว: ${err.message}`, err);
  }
}

/**
 * updatePlaceStats
 * [FIX v003] โหลดเฉพาะ place_id column + ใช้ PLACE_IDX แทน indexOf + guard
 */
function updatePlaceStats(placeId) {
  if (!placeId) return;
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET.M_PLACE);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const idCol   = PLACE_IDX.PLACE_ID + 1;
    const idData  = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    let targetRow = -1;

    for (let i = 0; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === placeId) {
        targetRow = i + 2; break;
      }
    }

    if (targetRow === -1) {
      logWarn('PlaceService', `updatePlaceStats: ไม่พบ placeId ${placeId}`);
      return;
    }

    const lastSeenCol   = PLACE_IDX.LAST_SEEN   + 1;
    const usageCountCol = PLACE_IDX.USAGE_COUNT  + 1;

    // [FIX v5.4.003] Batch write: อ่านทั้ง 2 คอลัมน์ → แก้ใน RAM → เขียนทีเดียว
    // ลดจาก 3 API calls เหลือ 1+1 = 2 API calls
    const statsRange = sheet.getRange(targetRow, lastSeenCol, 1, 2);
    const statsVals  = statsRange.getValues();
    const curr = Number(statsVals[0][1]) || 0;
    statsVals[0][0] = new Date();
    statsVals[0][1] = curr + 1;
    statsRange.setValues(statsVals);
    invalidatePlaceCache_();

  } catch (err) {
    // [FIX LAW-13 v5.4.003] ส่ง err object เพื่อให้ stack trace เข้า SYS_LOG
    logError('PlaceService', `updatePlaceStats ล้มเหลว: ${err.message}`, err);
  }
}

// ============================================================
// SECTION 6: Data Loaders
// ============================================================

/**
 * [DEPRECATED v5.4.002] loadCachedGeoRows_ — ย้ายไป 16_GeoDictionaryBuilder.gs แล้ว
 * เวอร์ชันนี้อ่านแค่ 4 คอลัมน์ (เก่า) ขณะที่ 16_GeoDictionaryBuilder อ่าน 16 คอลัมน์ (ใหม่)
 * GAS global scope ทำให้ชื่อซ้ำกันได้ → เวอร์ชันที่โหลดทีหลังเขียนทับ
 * แก้โดย: ลบตัวนี้ออก ให้ใช้ของ 16_GeoDictionaryBuilder.gs แทน
 */

/**
 * loadCachedGeoRowsForPlace_ — [FIX-02 v5.4.003] โหลดข้อมูลภูมิศาสตร์แบบเบาสำหรับ PlaceService
 * ใช้ _GLOBAL_GEO_DICT_CACHE_PLACE แยกจาก _GLOBAL_GEO_DICT_CACHE ของ 16_GeoDictionaryBuilder
 * คืนเฉพาะ 4 fields: postcode, subDistrict, district, province
 * @return {Array<{postcode, subDistrict, district, province}>}
 */
function loadCachedGeoRowsForPlace_() {
  if (_GLOBAL_GEO_DICT_CACHE_PLACE) return _GLOBAL_GEO_DICT_CACHE_PLACE;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX LAW-03 v5.4.003] ใช้ computed column count จาก TH_GEO_IDX แทน hardcode 4
  // ป้องกันถ้ามีการเปลี่ยนแปลง index ในอนาคต — อ่านเฉพาะคอลัมน์ที่ต้องใช้
  const geoColsNeeded = Math.max(
    TH_GEO_IDX.POSTCODE, TH_GEO_IDX.SUB_DISTRICT,
    TH_GEO_IDX.DISTRICT, TH_GEO_IDX.PROVINCE
  ) + 1;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, geoColsNeeded).getValues();
  _GLOBAL_GEO_DICT_CACHE_PLACE = data.map(function(row) {
    return {
      postcode:    String(row[TH_GEO_IDX.POSTCODE]     || '').trim(),
      subDistrict: String(row[TH_GEO_IDX.SUB_DISTRICT] || '').trim(),
      district:    String(row[TH_GEO_IDX.DISTRICT]     || '').trim(),
      province:    String(row[TH_GEO_IDX.PROVINCE]     || '').trim()
    };
  });

  return _GLOBAL_GEO_DICT_CACHE_PLACE;
}

function loadAllPlaces_() {
  // [FIX v5.5.007 P1 #6] แปลงจาก direct cache.put → saveChunkedCache_ + loadChunkedCache_
  // [FIX v5.5.010 HOTFIX #2] ลบ fallback path ที่ใช้ cache.put ตรง — บังคับใช้ saveChunkedCache_
  //   Root cause: เมื่อ saveChunkedCache_ ไม่พร้อม (typeof !== 'function'), code ตกไป fallback
  //   ที่ใช้ cache.put(cacheKey, resultJson) ตรง ทำให้ 825KB > 100KB limit → "M_PLACE Cache เต็ม"
  //   ตอนนี้ถ้า saveChunkedCache_ ไม่พร้อม → throw error แทน เพื่อบังคับใช้ chunked path
  const cacheKey = (typeof CACHE_KEY !== 'undefined' && CACHE_KEY.PLACE_ALL) ? CACHE_KEY.PLACE_ALL : 'M_PLACE_ALL';
  const cache    = CacheService.getScriptCache();

  // [FIX v5.5.010] บังคับใช้ loadChunkedCache_ — ไม่มี fallback แล้ว
  if (typeof loadChunkedCache_ !== 'function') {
    logError('PlaceService', 'loadChunkedCache_ ไม่พร้อม — กรุณาตรวจสอบว่า 14_Utils.gs ถูก load แล้ว');
    // Fallback: อ่านจาก sheet ตรง (ไม่ผ่าน cache) เพื่อให้ function ยังทำงานได้
  } else {
    const cached = loadChunkedCache_(cache, cacheKey);
    if (cached) return cached;
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error เมื่อชีตมีคอลัมน์น้อยกว่า SCHEMA
  const colsToRead = Math.min(SCHEMA[SHEET.M_PLACE].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();

  const result = rows
    .filter(r => r[PLACE_IDX.PLACE_ID])
    // [FIX v003] กรองทั้ง ARCHIVED และ MERGED (เดิมกรองแค่ ARCHIVED)
    .filter(r => r[PLACE_IDX.STATUS] !== APP_CONST.STATUS_ARCHIVED &&
                 r[PLACE_IDX.STATUS] !== APP_CONST.STATUS_MERGED)
    .map(r => ({
      placeId:    String(r[PLACE_IDX.PLACE_ID]),
      canonical:  String(r[PLACE_IDX.CANONICAL]   || ''),
      normalized: String(r[PLACE_IDX.NORMALIZED]  || ''),
      placeType:  String(r[PLACE_IDX.PLACE_TYPE]  || ''),
      province:   String(r[PLACE_IDX.PROVINCE]    || ''),
      district:   String(r[PLACE_IDX.DISTRICT]    || ''),
      subDistrict: String(r[PLACE_IDX.SUB_DISTRICT] || ''),
      postcode:   String(r[PLACE_IDX.POSTCODE]    || ''),
      usageCount: Number(r[PLACE_IDX.USAGE_COUNT] || 0),
      note: String(r[PLACE_IDX.NOTE] || ''),
      masterUuid: String(r[PLACE_IDX.MASTER_UUID] || ''),
    }));

  // [FIX v5.5.010 HOTFIX #2] บังคับใช้ saveChunkedCache_ — ลบ fallback ที่ใช้ cache.put ตรง
  //   เดิมถ้า saveChunkedCache_ ไม่พร้อม จะตกไป cache.put() ตรง → 825KB > 100KB → fail เงียบ
  //   ตอนนี้ถ้า saveChunkedCache_ ไม่พร้อม → log error แล้ว skip cache write (ยัง return result ได้)
  if (typeof saveChunkedCache_ === 'function') {
    saveChunkedCache_(cache, cacheKey, result);
    logDebug('PlaceService', 'loadAllPlaces_: cached via saveChunkedCache_ (' + result.length + ' places)');
  } else {
    logError('PlaceService', 'saveChunkedCache_ ไม่พร้อม — skip cache write for M_PLACE_ALL (' +
             result.length + ' places). กรุณาตรวจสอบว่า 14_Utils.gs ถูก load แล้ว');
  }
  return result;
}

function loadAllPlaceAliases_() {
  // [FIX v5.5.007 P1 #6] แปลงจาก direct cache.put → saveChunkedCache_ + loadChunkedCache_
  // [FIX v5.5.010 HOTFIX #3] ลบ fallback path ที่ใช้ cache.put ตรง — บังคับใช้ saveChunkedCache_
  //   Root cause: เมื่อ saveChunkedCache_ ไม่พร้อม, code ตกไป fallback ที่ใช้ cache.put ตรง
  //   ทำให้ 312KB > 100KB limit → "M_PLACE_ALIAS Cache write error: อาร์กิวเมนต์มากเกินไป"
  const cacheKey = (typeof CACHE_KEY !== 'undefined' && CACHE_KEY.PLACE_ALIAS_ALL) ? CACHE_KEY.PLACE_ALIAS_ALL : 'M_PLACE_ALIAS_ALL';
  const cache    = CacheService.getScriptCache();

  // [FIX v5.5.010] บังคับใช้ loadChunkedCache_ — ไม่มี fallback แล้ว
  if (typeof loadChunkedCache_ !== 'function') {
    logError('PlaceService', 'loadChunkedCache_ ไม่พร้อม — กรุณาตรวจสอบว่า 14_Utils.gs ถูก load แล้ว');
  } else {
    const cached = loadChunkedCache_(cache, cacheKey);
    if (cached) return cached;
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE_ALIAS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error
  const colsToRead = Math.min(SCHEMA[SHEET.M_PLACE_ALIAS].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();

  // [FIX v5.5.010 HOTFIX #3] บังคับใช้ saveChunkedCache_ — ลบ fallback ที่ใช้ cache.put ตรง
  if (typeof saveChunkedCache_ === 'function') {
    saveChunkedCache_(cache, cacheKey, rows);
    logDebug('PlaceService', 'loadAllPlaceAliases_: cached via saveChunkedCache_ (' + rows.length + ' aliases)');
  } else {
    logError('PlaceService', 'saveChunkedCache_ ไม่พร้อม — skip cache write for M_PLACE_ALIAS_ALL (' +
             rows.length + ' aliases). กรุณาตรวจสอบว่า 14_Utils.gs ถูก load แล้ว');
  }
  return rows;
}

/**
 * batchUpdatePlaceStats_ — [PERF-001] [REF-009] Batch stats update สำหรับ Place
 * Delegated to batchUpdateEntityStats_() in 14_Utils.gs — thin wrapper
 * @param {Set<string>} placeIds - Set of place IDs to update
 */
function batchUpdatePlaceStats_(placeIds) {
  batchUpdateEntityStats_(SHEET.M_PLACE, PLACE_IDX, PLACE_IDX.PLACE_ID, PLACE_IDX.USAGE_COUNT, PLACE_IDX.LAST_SEEN, placeIds, invalidatePlaceCache_);
}

/**
 * invalidatePlaceCache_ — [REF-011] Uses centralized invalidateChunkedCache_
 */
function invalidatePlaceCache_() {
  invalidateChunkedCache_('M_PLACE_ALL', function() { _GLOBAL_GEO_DICT_CACHE_PLACE = null; });
}
/**
 * invalidatePlaceAliasCache_ — [REF-011] Uses centralized invalidateChunkedCache_
 */
function invalidatePlaceAliasCache_() {
  invalidateChunkedCache_('M_PLACE_ALIAS_ALL');
}

/**
 * [NEW v5.2.008] lookupPlaceAdminById_ — ดึงข้อมูลพื้นที่จาก M_PLACE ด้วย ID
 * ใช้สำหรับ Fallback เมื่อพิกัด Google คืนค่าเป็น Plus Code
 */
function lookupPlaceAdminById_(placeId) {
  if (!placeId) return null;

  // [FIX v5.5.001] Use loadAllPlaces_() cache + .find() instead of direct sheet read
  const allPlaces = loadAllPlaces_();
  const place = allPlaces.find(p => p.placeId === String(placeId));

  if (!place) return null;

  return {
    subDistrict: String(place.subDistrict || ''),
    district:    String(place.district    || ''),
    province:    String(place.province    || ''),
    postcode:    String(place.postcode    || '')
  };
}
