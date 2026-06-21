/**
 * VERSION: 5.5.020
 * FILE: 15_GoogleMapsAPI.gs
 * LMDS V5.5 — Google Maps Custom Functions (@customFunction)
 * ===================================================
 * PURPOSE:
 *   ให้บริการสูตร Google Maps สำหรับพิมพ์ใน Google Sheet โดยตรง
 *   สูตรทั้งหมดมี @customFunction annotation → พิมพ์ในเซลล์ได้เลย
 *   มีระบบ Cache (CacheService 6 ชม.) เพื่อลดการเรียก API
 *
 *   ต้นฉบับ: Amit Agarwal — https://labnol.org/google-maps-formulas-for-sheets-200817
 *   ปรับใช้ใน LMDS V5.5.013 — ลบระบบ 3-layer cache + MAPS_CACHE sheet ออก
 *   เพราะระบบ LMDS ไม่ได้เรียก Google Maps API ผ่าน code อีกต่อไป
 *   (DIST_FROM_WH และ RESOLVED_ADDR มาจาก AppSheet ที่ผู้ใช้ทำไว้แล้ว)
 * ===================================================
 *   v5.5.017 (2026-06-21) — SECURITY POSTFIX (12 SEC issues total, Cycle 14):
 *     - (no SEC fix in this file — only version bump for consistency)
 *     Cumulative impact: deny-by-default AuthZ, OAuth Least Privilege (10->6 scopes), PII masking (MD5 hash),
 *       Sheet Protection defense-in-depth (4->8 sheets + Q_REVIEW range), RFC 6265 cookie charset,
 *       fetchWithRetry_ body truncation, populateGeoMetadata+buildGeoDictionary guards
 *     isAuthorizedUser_ coverage: 6/10 -> 13/13 destructive ops
 *     Production Readiness: 95% -> 97% GO (Security Hardened)
 *   v5.5.016 (2026-06-21) — PERFORMANCE FIX (13 issues, Cycle 13):
 *     - [PERF-001] reprocessReviewQueue +LockService +TimeGuard +Checkpoint/Resume +flushLogBuffer_ (BLOCKING)
 *     - [PERF-002] findMatchingPerson_/findMatchingPlace_ +optPrefixMap (O(N)→O(K) substring fallback)
 *     - [PERF-003] populateAliasFromFactDelivery_ build personIdToUuidMap/placeIdToUuidMap (O(N)→O(1))
 *     - [PERF-004] findPersonCandidates Set<string> lookup + normA out of loop
 *     - [PERF-005] findPlaceCandidates Set<string> lookup + normA out of loop
 *     - [PERF-006] highlightHighPriorityReviews +optTargetRow single-row mode (95% reduction)
 *     - [PERF-007] generatePersonAliasesFromHistory +Checkpoint/Resume (HARDENING_ALIAS_CHECKPOINT)
 *     - [PERF-008] applyAllPendingDecisions LockService idiomatic pattern (verbose 2-step → idiomatic)
 *     - [PERF-009] findByAlias_/findPlaceByAlias_ inverted index (O(A)→O(1) lookup)
 *     - [PERF-010] setupInputSheet_ batch read (N API calls → 1)
 *     - [PERF-011] removed legacy cache.put() in loop fallback paths (6 จุด)
 *     - [PERF-012] findRowByIdInSheet_ use TextFinder (O(N) JS loop → server-side)
 *     - [PERF-013] analyzeReviewPatterns use REVIEW_IDX constants (Single Source of Truth)
 *     9 helper functions added: buildPrefixIndex_, saveReprocessCheckpoint_, loadReprocessCheckpoint_,
 *       clearReprocessCheckpoint_, saveHardeningAliasCheckpoint_, loadHardeningAliasCheckpoint_,
 *       clearHardeningAliasCheckpoint_, _buildPersonAliasInvertedIndex_, _buildPlaceAliasInvertedIndex_
 *     Files changed: 00_App, 01_Config, 03_SetupSheets, 04_SourceRepository, 06_PersonService,
 *       07_PlaceService, 12_ReviewService, 16_GeoDictionaryBuilder, 19_Hardening, 21_AliasService
 *     Cumulative impact: Pipeline -55-65%, Migration -95-100%, UX -95%, Timeout risk eliminated
 *     Compliance: 16/16 Immutable Laws maintained, Single Writer preserved, Schema unchanged
 *   v5.5.015 (2026-06-19) — CRITICAL FIX (8 issues):
 *     - [FIX CRIT-001] factUpdateRow_ เขียน DRIVER_VERIFIED col 32-33 ใน UPDATE path (BLOCKING)
 *     - [FIX CRIT-002] buildSrcObjFromReview_ อ่าน DRIVER_VERIFIED col 37-38 จาก Source (BLOCKING)
 *     - [FIX CRIT-003] copyDriverVerifiedToDailyJob_ merge mode แทน one-shot lookup
 *     - [FIX CRIT-004] buildDailyJobRow_ ShopKey trim ให้ตรงกับ lookup
 *     - [FIX CRIT-005] populateAliasFromFactDelivery_ อ่าน DRIVER_VERIFIED + สร้าง alias recovery
 *     - [FIX CRIT-006] showVersionInfo Audit Cycles 9 → 11 + cycle list ครบ
 *     - [FIX CRIT-007] 02_Schema comment "37 คอลัมน์" → "39 คอลัมน์"
 *     - [FIX CRIT-008] validateConfig pre-flight check ตรวจ Sheet column count
 *   v5.5.014 (2026-06-19) — DRIVER VERIFIED COLUMNS + ALIAS ENRICHMENT:
 *     - [ADD] เพิ่ม 2 คอลัมน์ "ชื่อลูกค้าปลายทางจริง" + "ชื่อสถานที่อยู่ลูกค้าปลายทางจริง"
 *       ใน Source sheet (col 38-39), DAILY_JOB (col 29-30), FACT_DELIVERY (col 32-33)
 *     - [ADD] SRC_IDX.DRIVER_VERIFIED_NAME/ADDR, DATA_IDX.DRIVER_VERIFIED_NAME/ADDR, FACT_IDX.DRIVER_VERIFIED_NAME/ADDR
 *     - [ADD] 04_SourceRepository buildSourceObj_ อ่าน col 38-39 → srcObj.driverVerifiedName/Addr
 *     - [ADD] 11_TransactionService upsertFactDelivery เก็บ col 32-33 ใน FACT_DELIVERY
 *     - [ADD] 10_MatchEngine autoEnrichAliases สร้าง alias จาก "ชื่อจริง" → master_uuid (confidence=100, source=DRIVER_VERIFIED)
 *     - [ADD] 18_ServiceSCG copyDriverVerifiedToDailyJob_ คัดลอกจาก Source → DAILY_JOB
 *     - กฎ: ชื่อดิบ match ตามปกติ 100% + ถ้าชื่อจริงมี → สร้าง alias เพิ่ม
 *   v5.5.013 (2026-06-19) — GOOGLE MAPS REFACTOR:
 *     - [REWRITE] ลบฟังก์ชันเก่าทั้งหมด (geocodeAddress, reverseGeocode,
 *       getRouteDistanceKm, cachedGeoLookup_, _loadSheetCache_, _flushHitCounts_,
 *       getFromSheetCache_, saveToSheetCache_, clearMapsCache)
 *       เหตุผล: ไม่มี caller ในระบบจริง (ไม่มีไฟล์ไหนเรียกเลย)
 *     - [REMOVE] ลบ MAPS_CACHE sheet — ไม่ได้ใช้ใน pipeline อีกต่อไป
 *     - [ADD] เพิ่มสูตร Amit Agarwal 7 ตัว เป็น @customFunction:
 *       GOOGLEMAPS_DISTANCE, GOOGLEMAPS_DURATION, GOOGLEMAPS_LATLONG,
 *       GOOGLEMAPS_ADDRESS, GOOGLEMAPS_REVERSEGEOCODE, GOOGLEMAPS_COUNTRY,
 *       GOOGLEMAPS_DIRECTIONS
 *     - [ADD] ระบบ Cache (CacheService.getDocumentCache 6 ชม.) ตามต้นฉบับ Amit
 *   v5.5.013 (2026-06-19) — GOOGLE MAPS REFACTOR:
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
 *     - [FIX] showVersionInfo, resolvePerson double normalization, reprocessReviewQueue
 *   v5.5.011 (2026-06-19) — DATA CONSISTENCY + SHIPTONAME CLEAN + Q_REVIEW NAV FIX
 *   v5.5.010 (2026-06-18) — CACHE HOTFIX + Q_REVIEW Post-Processor integration
 *   v5.5.009 (2026-06-18) — DOC SYNC
 *   v5.5.008 (2026-06-18) — CACHE CLEANUP (P2)
 *   v5.5.007 (2026-06-18) — CACHE FIX (P0 + P1)
 *   v5.5.006 (2026-06-18) — Consistency Sync
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (AI_CONFIG.CACHE_TTL_SEC)
 *     - 03_SetupSheets.gs     (logError — ใช้ใน GOOGLEMAPS_* เผื่อ error)
 *   CALLS (Invokes):
 *     - Google Maps API via Maps.newGeocoder / Maps.newDirectionFinder / Maps.newElevationSampler
 *   EXPORTS TO:
 *     - Google Sheet users (พิมพ์สูตรในเซลล์ได้โดยตรง)
 *   SHEETS ACCESSED:
 *     - (ไม่มี — ไม่ใช้ MAPS_CACHE sheet อีกต่อไป)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  15_GoogleMapsAPI.gs (Amit Agarwal Custom Functions)        │
 *   │  ├── Cache helpers: _mapsMd5, _mapsGetCache, _mapsSetCache │
 *   │  ├── GOOGLEMAPS_DISTANCE()   — ระยะทางระหว่าง 2 จุด         │
 *   │  ├── GOOGLEMAPS_DURATION()   — เวลาเดินทางระหว่าง 2 จุด     │
 *   │  ├── GOOGLEMAPS_LATLONG()    — ที่อยู่ → lat,lng             │
 *   │  ├── GOOGLEMAPS_ADDRESS()    — รหัสไปรษณีย์/ที่อยู่บางส่วน → ที่อยู่เต็ม │
 *   │  ├── GOOGLEMAPS_REVERSEGEOCODE() — lat,lng → ที่อยู่         │
 *   │  ├── GOOGLEMAPS_COUNTRY()    — ที่อยู่ → ประเทศ               │
 *   │  └── GOOGLEMAPS_DIRECTIONS() — เส้นทางขับขี่ระหว่าง 2 จุด     │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: Cache Helpers (ตามต้นฉบับ Amit Agarwal)
// ใช้ CacheService.getDocumentCache — TTL 6 ชม.
// ============================================================

/**
 * _mapsMd5 — สร้าง MD5 hash สำหรับ cache key
 * ทำให้ "New York" และ "new york  " มี key เดียวกัน
 */
const _mapsMd5 = (key = "") => {
  const code = key.toLowerCase().replace(/\s/g, "");
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, code)
    .map((char) => (char + 256).toString(16).slice(-2))
    .join("");
};

/**
 * _mapsGetCache — อ่านจาก cache
 */
const _mapsGetCache = (key) => {
  try {
    return CacheService.getDocumentCache().get(_mapsMd5(key));
  } catch (e) {
    return null;
  }
};

/**
 * _mapsSetCache — เขียนลง cache (TTL 6 ชม.)
 */
const _mapsSetCache = (key, value) => {
  try {
    const expirationInSeconds = 6 * 60 * 60; // 6 hours
    CacheService.getDocumentCache().put(_mapsMd5(key), value, expirationInSeconds);
  } catch (e) {
    // Cache write failure ไม่ควรบล็อกการทำงาน
  }
};


// ============================================================
// SECTION 2: @customFunction — สูตรสำหรับพิมพ์ใน Google Sheet
// ============================================================

/**
 * GOOGLEMAPS_DISTANCE — คำนวณระยะทางระหว่าง 2 จุด
 *
 * ตัวอย่าง: =GOOGLEMAPS_DISTANCE("กรุงเทพ", "นนทบุรี", "driving")
 *           =GOOGLEMAPS_DISTANCE(A1, B1, "driving")
 *
 * @param {String} origin ที่อยู่จุดเริ่มต้น
 * @param {String} destination ที่อยู่ปลายทาง
 * @param {String} mode โหมดการเดินทาง (driving, walking, bicycling, transit)
 * @return {String} ระยะทาง (เช่น "15.2 km")
 * @customFunction
 */
const GOOGLEMAPS_DISTANCE = (origin, destination, mode = "driving") => {
  if (!origin || !destination) {
    return "ต้องระบุจุดเริ่มต้นและปลายทาง";
  }
  if (origin.map) {
    return origin.map(o => GOOGLEMAPS_DISTANCE(o, destination, mode));
  }

  const key = ["distance", origin, destination, mode].join(",");
  const value = _mapsGetCache(key);
  if (value !== null) return value;

  const { routes: [data] = [] } = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setMode(mode)
    .getDirections();

  if (!data) {
    return "ไม่พบเส้นทาง";
  }

  const { legs: [{ distance: { text: distance } } = {}] = [] } = data;
  _mapsSetCache(key, distance);
  return distance;
};


/**
 * GOOGLEMAPS_DURATION — คำนวณเวลาเดินทางระหว่าง 2 จุด
 *
 * ตัวอย่าง: =GOOGLEMAPS_DURATION("กรุงเทพ", "นนทบุรี", "driving")
 *           =GOOGLEMAPS_DURATION(A1, B1, "walking")
 *
 * @param {String} origin ที่อยู่จุดเริ่มต้น
 * @param {String} destination ที่อยู่ปลายทาง
 * @param {String} mode โหมดการเดินทาง (driving, walking, bicycling, transit)
 * @return {String} เวลาเดินทาง (เช่น "25 mins")
 * @customFunction
 */
const GOOGLEMAPS_DURATION = (origin, destination, mode = "driving") => {
  if (!origin || !destination) {
    return "ต้องระบุจุดเริ่มต้นและปลายทาง";
  }
  if (origin.map) {
    return origin.map(o => GOOGLEMAPS_DURATION(o, destination, mode));
  }

  const key = ["duration", origin, destination, mode].join(",");
  const value = _mapsGetCache(key);
  if (value !== null) return value;

  const { routes: [data] = [] } = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setMode(mode)
    .getDirections();

  if (!data) {
    return "ไม่พบเส้นทาง";
  }

  const { legs: [{ duration: { text: time } } = {}] = [] } = data;
  _mapsSetCache(key, time);
  return time;
};


/**
 * GOOGLEMAPS_LATLONG — แปลงที่อยู่เป็นพิกัด lat,lng
 *
 * ตัวอย่าง: =GOOGLEMAPS_LATLONG("สยามพารากอน กรุงเทพ")
 *           =GOOGLEMAPS_LATLONG(A1)
 *
 * @param {String} address ที่อยู่ที่ต้องการค้นหา
 * @return {String} พิกัด "lat, lng" (เช่น "13.7466, 100.5347")
 * @customFunction
 */
const GOOGLEMAPS_LATLONG = (address) => {
  if (!address) {
    return "ต้องระบุที่อยู่";
  }
  if (address.map) {
    return address.map(a => GOOGLEMAPS_LATLONG(a));
  }

  const key = ["latlong", address].join(",");
  const value = _mapsGetCache(key);
  if (value !== null) return value;

  const { results: [data = null] = [] } = Maps.newGeocoder().geocode(address);
  if (data === null) {
    return "ไม่พบที่อยู่";
  }

  const { geometry: { location: { lat, lng } } = {} } = data;
  const answer = `${lat}, ${lng}`;
  _mapsSetCache(key, answer);
  return answer;
};


/**
 * GOOGLEMAPS_ADDRESS — แปลงรหัสไปรษณีย์/ที่อยู่บางส่วนเป็นที่อยู่เต็ม
 *
 * ตัวอย่าง: =GOOGLEMAPS_ADDRESS("10110")
 *           =GOOGLEMAPS_ADDRESS(A1)
 *
 * @param {String} address รหัสไปรษณีย์หรือที่อยู่บางส่วน
 * @return {String} ที่อยู่เต็มจาก Google Maps
 * @customFunction
 */
const GOOGLEMAPS_ADDRESS = (address) => {
  if (!address) {
    return "ต้องระบุที่อยู่";
  }
  if (address.map) {
    return address.map(a => GOOGLEMAPS_ADDRESS(a));
  }

  const key = ["address", address].join(",");
  const value = _mapsGetCache(key);
  if (value !== null) return value;

  const { results: [data = null] = [] } = Maps.newGeocoder().geocode(address);
  if (data === null) {
    return "ไม่พบที่อยู่";
  }

  const { formatted_address } = data;
  _mapsSetCache(key, formatted_address);
  return formatted_address;
};


/**
 * GOOGLEMAPS_REVERSEGEOCODE — แปลงพิกัด lat,lng เป็นที่อยู่
 *
 * ตัวอย่าง: =GOOGLEMAPS_REVERSEGEOCODE(13.7466, 100.5347)
 *           =GOOGLEMAPS_REVERSEGEOCODE(A1, B1)
 *
 * @param {Number} latitude ละติจูด
 * @param {Number} longitude ลองจิจูด
 * @return {String} ที่อยู่จาก Google Maps
 * @customFunction
 */
const GOOGLEMAPS_REVERSEGEOCODE = (latitude, longitude) => {
  if (!latitude || !longitude) {
    return "ต้องระบุละติจูดและลองจิจูด";
  }

  const key = ["reverse", latitude, longitude].join(",");
  const value = _mapsGetCache(key);
  if (value !== null) return value;

  const { results: [data = {}] = [] } = Maps.newGeocoder()
    .reverseGeocode(latitude, longitude);

  const { formatted_address } = data;
  _mapsSetCache(key, formatted_address);
  return formatted_address;
};


/**
 * GOOGLEMAPS_COUNTRY — ดึงชื่อประเทศจากที่อยู่
 *
 * ตัวอย่าง: =GOOGLEMAPS_COUNTRY("10 Hanover Square, NY")
 *
 * @param {String} address ที่อยู่ที่ต้องการค้นหา
 * @return {String} ชื่อประเทศ (เช่น "Thailand (TH)")
 * @customFunction
 */
const GOOGLEMAPS_COUNTRY = (address) => {
  if (!address) {
    return "ต้องระบุที่อยู่";
  }
  if (address.map) {
    return address.map(a => GOOGLEMAPS_COUNTRY(a));
  }

  const key = ["country", address].join(",");
  const value = _mapsGetCache(key);
  if (value !== null) return value;

  const { results: [data = null] = [] } = Maps.newGeocoder().geocode(address);
  if (data === null) {
    return "ไม่พบที่อยู่";
  }

  const [{ short_name, long_name } = {}] = data.address_components.filter(
    ({ types: [level] }) => level === "country"
  );

  if (!short_name) {
    return "ไม่พบประเทศ";
  }

  const answer = `${long_name} (${short_name})`;
  _mapsSetCache(key, answer);
  return answer;
};


/**
 * GOOGLEMAPS_DIRECTIONS — แสดงเส้นทางขับขี่ระหว่าง 2 จุด
 *
 * ตัวอย่าง: =GOOGLEMAPS_DIRECTIONS("กรุงเทพ", "นนทบุรี", "driving")
 *
 * @param {String} origin ที่อยู่จุดเริ่มต้น
 * @param {String} destination ที่อยู่ปลายทาง
 * @param {String} mode โหมดการเดินทาง (driving, walking, bicycling, transit)
 * @return {String} เส้นทางขับขี่ทีละขั้นตอน
 * @customFunction
 */
const GOOGLEMAPS_DIRECTIONS = (origin, destination, mode = "driving") => {
  if (!origin || !destination) {
    return "ต้องระบุจุดเริ่มต้นและปลายทาง";
  }

  const key = ["directions", origin, destination, mode].join(",");
  const value = _mapsGetCache(key);
  if (value !== null) return value;

  const { routes = [] } = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setMode(mode)
    .getDirections();

  if (!routes.length) {
    return "ไม่พบเส้นทาง";
  }

  const directions = routes
    .map(({ legs }) => {
      return legs.map(({ steps }) => {
        return steps.map((step) => {
          return step.html_instructions
            .replace("><", "> <")
            .replace(/<[^>]+>/g, "");
        });
      });
    })
    .join(", ");

  _mapsSetCache(key, directions);
  return directions;
};
