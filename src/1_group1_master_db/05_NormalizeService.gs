/**
 * VERSION: 5.5.017
 * FILE: 05_NormalizeService.gs
 * LMDS V5.5 — Thai Name & Place Normalization
 * ===================================================
 * PURPOSE:
 *   ทำความสะอาดและ normalize ชื่อบุคคลและสถานที่
 *   เป็น Single Source of Truth สำหรับการทำความสะอาดข้อมูล
 * ===================================================
 *   v5.5.017 (2026-06-21) — SECURITY POSTFIX (12 SEC issues total, Cycle 14):
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
 * ===================================================
 * CHANGELOG: See /docs/CHANGELOG.md for full history.
 *   Latest 3 versions:
 *     v5.5.019 (2026-06-22) — REFACTOR_CYCLE6 (12 issues — REF-001 to REF-012)
 *     v5.5.018 (2026-06-21) — REVIEW15 CLEAN CODE FIX (14 issues)
 *     v5.5.017 (2026-06-21) — SECURITY POSTFIX (12 SEC issues)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 14_Utils (diceCoefficient, levenshteinDistance) [for scoring in other files]
 *   CALLS (Invokes):
 *     - logInfo() → 03_SetupSheets
 *     - escapeRegex_() → (self)
 *     - buildNormResult_() → (self)
 *   EXPORTS TO:
 *     - 06_PersonService (normalizePersonNameFull)
 *     - 07_PlaceService (normalizePlaceName)
 *     - 17_SearchService (normalizePersonNameFull, normalizePlaceName)
 *     - 10_MatchEngine (all matching)
 *     - 16_GeoDictionaryBuilder (normalizeForCompare)
 *     - 21_AliasService (normalizeForCompare)
 *     - 19_Hardening (normalizeForCompare)
 *     - 20_ThGeoService (normalizeForCompare)
 *   SHEETS ACCESSED:
 *     - None (pure computation module)
 * ===================================================
 * ARCHITECTURE:
 *   Text Cleaner
 *   ┌──────────────────────────────────────────────────────┐
 *   │ normalizePersonNameFull (7 steps):                   │
 *   │   1. extractPhone                                   │
 *   │   2. extractDoc                                     │
 *   │   3. extractDeliveryNotes                           │
 *   │   4. checkCompany                                   │
 *   │   5. stripPrefix                                    │
 *   │   6. cleanSpecialChars                              │
 *   │   7. buildNormResult_                               │
 *   │                                                     │
 *   │ normalizePlaceName (4 steps):                        │
 *   │   1. extractPhone/Doc                               │
 *   │   2. detectType                                     │
 *   │   3. extractDeliveryNotes                           │
 *   │   4. stripSuffix                                    │
 *   │                                                     │
 *   │ buildThaiPhoneticKey → consonant key                │
 *   │ normalizeForCompare → lowercase + strip spaces      │
 *   └──────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: Dictionaries
// ============================================================

const PERSON_PREFIX_LIST = [
  'พลเอก','พลโท','พลตรี','พันเอก','พันโท','พันตรี',
  'ร้อยเอก','ร้อยโท','ร้อยตรี',
  'จ่าสิบเอก','จ่าสิบโท','จ่าสิบตรี',
  'สิบเอก','สิบโท','สิบตรี','พลทหาร',
  'พลเรือเอก','พลเรือโท','พลเรือตรี',
  'นาวาเอก','นาวาโท','นาวาตรี',
  'เรือเอก','เรือโท','เรือตรี',
  'พลอากาศเอก','พลอากาศโท','พลอากาศตรี',
  'นาวาอากาศเอก','นาวาอากาศโท','นาวาอากาศตรี',
  'เรืออากาศเอก','เรืออากาศโท','เรืออากาศตรี',
  'พลตำรวจเอก','พลตำรวจโท','พลตำรวจตรี',
  'พันตำรวจเอก','พันตำรวจโท','พันตำรวจตรี',
  'ร้อยตำรวจเอก','ร้อยตำรวจโท','ร้อยตำรวจตรี',
  'สิบตำรวจเอก','สิบตำรวจโท','สิบตำรวจตรี',
  'พลตำรวจ','ผู้กำกับ','รองผู้กำกับ',
  'ศาสตราจารย์','รองศาสตราจารย์','ผู้ช่วยศาสตราจารย์',
  'นายแพทย์','แพทย์หญิง','ทันตแพทย์','เภสัชกร',
  'วิศวกร','สถาปนิก',
  'นาย','นาง','นางสาว','น.ส.',
  'คุณ','ครู','อาจารย์',
  'ดร.','ดร',
  'พ.อ.','พ.ต.','ร.อ.','ร.ต.','ส.อ.',
  'พ.ต.อ.','พ.ต.ท.','พ.ต.ต.',
  'ร.ต.อ.','ร.ต.ท.','ร.ต.ต.',
];

/**
 * SORTED_PREFIX_LIST — [ADD v003] Pre-sort ครั้งเดียว
 * แทนการ sort ทุกครั้งที่เรียก normalizePersonNameFull
 */
const SORTED_PREFIX_LIST = PERSON_PREFIX_LIST
  .slice()
  .sort((a, b) => b.length - a.length);

/**
 * COMPANY_SUFFIX_LIST — [FIX v003] เรียงยาวไปสั้น (longest-first)
 * ป้องกัน "จำกัด" ตัดก่อน "ห้างหุ้นส่วนจำกัด"
 */
const COMPANY_SUFFIX_LIST = [
  'จำกัด(มหาชน)', 'จำกัด (มหาชน)',
  'ห้างหุ้นส่วนจำกัด', 'ห้างหุ้นส่วนสามัญ',
  'มหาชน', 'บริษัท', 'บมจ.', 'บจก.', 'หจก.', 'หสน.',
  'บจ.', 'หจ.', 'บมจ', 'บจก', 'หจก',
  'จำกัด', '(จำกัด)', 'จก.',
  'ร้านค้า', 'กิจการ', 'ร้าน',
].sort((a, b) => b.length - a.length); // sort ทันทีตอน declare

const CHAIN_STORE_LIST = [
  'ไทวัสดุ','โฮมโปร','โกลบอลเฮ้าส์','สยามโกลบอล',
  'แพลนท์ปูน','ปูนซีเมนต์','ศูนย์บริการ',
  'ไซต์งาน','โครงการ','หน่วยงาน',
  'วัสดุภัณฑ์','วัสดุก่อสร้าง',
];

const DELIVERY_NOTE_LIST = [
  'ฝากป้อม','ฝากรปภ','ฝากยาม','ฝากรักษาความปลอดภัย',
  'COD','เก็บเงินปลายทาง',
  'ห้ามโยน','ระวังแตก','ระวังหัก','บอบบาง',
  'แช่เย็น','เก็บในที่เย็น',
  'ส่งด่วน','ด่วนมาก','ด่วนพิเศษ',
  'ส่งก่อน','ส่งหลัง',
  'นัดส่ง','โทรก่อนส่ง','โทรนัด','โทร.','โทร','ติดต่อ','เบอร์โทร','เบอร์','เบอร์ติดต่อ',
].sort((a, b) => b.length - a.length); // [FIX v008] เรียงยาวไปสั้น

// ============================================================
// SECTION 2: Regex Patterns
// ============================================================

const PHONE_PATTERN   = /(?:\+66|0)[0-9]{1,2}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4}/g;
const DOC_NO_PATTERN  = /\b[0-9]{8,}\b/g;
const REF_NO_PATTERN  = /#[0-9]+|No\.?\s*[0-9]+/gi;

// ============================================================
// SECTION 3: normalizePersonNameFull
// ============================================================

/**
 * runNormalize — Entry Point จาก Menu / Pipeline
 * [FIX v003] เพิ่ม comment อธิบายว่า Normalize เกิดใน processOneRow()
 * ไม่ใช่ Batch แยก — ฟังก์ชันนี้เป็น Placeholder สำหรับขยายอนาคต
 */
function runNormalize() {
  // Normalize เกิดใน processOneRow() ของ 10_MatchEngine.gs ต่อทุก row
  // ไม่ต้องทำ Batch แยก เพราะ Source Repository ส่ง srcObj เข้า Engine แล้ว
  logInfo('NormalizeService', 'Normalize ทำงานใน processOneRow() ของ MatchEngine');
}

/**
 * normalizePersonNameFull — ล้างชื่อบุคคลแบบสมบูรณ์
 * @param {string} rawName
 */
function normalizePersonNameFull(rawName) {
  const original = String(rawName || '').trim();
  let working    = original;
  const notes    = [];

  if (!working) {
    return buildNormResult_(original, '', false, '', '', []);
  }

  // --- Step 1: ดึงเบอร์โทรออก ---
  const phoneResult = normExtractPhone_(working);
  working = phoneResult.working;
  const extractedPhone = phoneResult.phone;

  // --- Step 2: ดึงเลขเอกสารออก ---
  const docResult = normExtractDocNo_(working);
  working = docResult.working;
  const extractedDoc = docResult.docNo;
  if (docResult.notes.length > 0) notes.push(...docResult.notes);

  // --- Step 3: ดึง Delivery Notes ออก (global replace) ---
  DELIVERY_NOTE_LIST.forEach(noteWord => {
    if (working.includes(noteWord)) {
      notes.push(noteWord);
      const safeNote = escapeRegex_(noteWord);
      working = working.replace(new RegExp(safeNote, 'g'), '').trim();
    }
  });

  // --- Step 4: ตรวจสอบนิติบุคคล ---
  const companyResult = normNormalizeCompany_(working);
  working    = companyResult.working;
  const isCompany = companyResult.isCompany;
  if (companyResult.notes.length > 0) notes.push(...companyResult.notes);

  // --- Step 5: ตัดคำนำหน้า + Thai Acronyms ---
  if (!isCompany) {
    const honorificResult = normCleanHonorific_(working);
    working = honorificResult.working;
    if (honorificResult.notes.length > 0) notes.push(...honorificResult.notes);
  }

  // --- Step 6: ล้างช่องว่างและอักขระพิเศษ ---
  working = working.replace(/\s+/g, ' ')
                   .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, '')
                   .trim();

  return buildNormResult_(
    original, working, isCompany,
    extractedPhone, extractedDoc, notes
  );
}

/**
 * buildNormResult_ — สร้าง Object ผลลัพธ์ Normalize
 */
function buildNormResult_(original, cleanName, isCompany, phone, docNo, notes) {
  return {
    cleanName:      cleanName,
    isCompany:      isCompany,
    extractedPhone: phone,
    extractedDocNo: docNo,
    deliveryNotes:  notes,
    originalName:   original,
  };
}

// ============================================================
// SECTION 3.1: normalizePersonNameFull — Private Helpers
// ============================================================

/**
 * normExtractPhone_ — extracts phone number from working string
 * @param {string} working - current working string
 * @return {{ working: string, phone: string }}
 */
function normExtractPhone_(working) {
  let phone = '';
  const phoneMatches = working.match(PHONE_PATTERN);
  if (phoneMatches) {
    phone = phoneMatches[0].replace(/[-.\s]/g, '');
    // [UPGRADE v5.2.003] ไม่เก็บลง Note สำหรับ Person (เพราะมีคอลัมน์ Phone แยกแล้ว)
    working = working.replace(PHONE_PATTERN, '').trim();
  }
  return { working: working, phone: phone };
}

/**
 * normExtractDocNo_ — extracts document numbers and ref numbers from working string
 * @param {string} working - current working string
 * @return {{ working: string, docNo: string, notes: string[] }}
 */
function normExtractDocNo_(working) {
  let docNo = '';
  const notes = [];

  const docMatches = working.match(DOC_NO_PATTERN);
  if (docMatches) {
    docNo = docMatches.join(',');
    // [FIX v5.2.002] เก็บลง Note ห้ามทิ้ง
    docMatches.forEach(d => notes.push(d));
    working = working.replace(DOC_NO_PATTERN, '').trim();
  }
  const refMatches = working.match(REF_NO_PATTERN);
  if (refMatches) {
    const refStr = refMatches.join(',');
    docNo = docNo ? `${docNo},${refStr}` : refStr;
    // [FIX v5.2.002] เก็บลง Note ห้ามทิ้ง
    refMatches.forEach(r => notes.push(r));
    working = working.replace(REF_NO_PATTERN, '').trim();
  }
  return { working: working, docNo: docNo, notes: notes };
}

/**
 * normNormalizeCompany_ — normalizes company suffixes and chain store names
 * @param {string} working - current working string
 * @return {{ working: string, isCompany: boolean, notes: string[] }}
 */
function normNormalizeCompany_(working) {
  let isCompany = false;
  const notes = [];

  const hasCompanySuffix = COMPANY_SUFFIX_LIST.some(s => {
    const idx = working.indexOf(s);
    if (idx === -1) return false;
    const before = idx > 0 ? working[idx - 1] : ' ';
    return /[\s\(ก-๙a-zA-Z]/.test(before) || idx === 0;
  });
  const hasChainStore = CHAIN_STORE_LIST.some(s => working.includes(s));

  if (hasCompanySuffix || hasChainStore) {
    isCompany = true;
    // [FIX v5.2.002] เก็บ Suffix ลง Note ก่อนตัดออก
    COMPANY_SUFFIX_LIST.forEach(suffix => {
      if (working.includes(suffix)) {
        notes.push(suffix);
        const safeSuffix = escapeRegex_(suffix);
        working = working.replace(new RegExp(safeSuffix, 'gi'), '').trim();
      }
    });
    // [FIX v5.2.002] เก็บ Chain Store ลง Note ก่อนตัดออก
    CHAIN_STORE_LIST.forEach(chain => {
      if (working.includes(chain)) {
        notes.push(chain);
        const safeChain = escapeRegex_(chain);
        working = working.replace(new RegExp(safeChain, 'gi'), '').trim();
      }
    });
  }

  return { working: working, isCompany: isCompany, notes: notes };
}

/**
 * normCleanHonorific_ — removes honorific prefixes and Thai acronyms
 * @param {string} working - current working string
 * @return {{ working: string, notes: string[] }}
 */
function normCleanHonorific_(working) {
  const notes = [];

  // Strip honorific prefixes
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of SORTED_PREFIX_LIST) {
      if (working.startsWith(prefix)) {
        notes.push(prefix);
        working = working.substring(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }

  // --- Step 5.1: หักหัวเขา (Thai Acronyms) ---
  const tailPatterns = [/^\s*ว่าน\s+/, /^\s*โอ๊ะ\s+/, /^\s*ชาย\s+/, /^\s*หญิง\s+/];
  tailPatterns.forEach(pattern => {
    const match = working.match(pattern);
    if (match) {
      notes.push(match[0].trim()); // [FIX v5.2.002] เก็บลง Note
      working = working.replace(pattern, '').trim();
    }
  });

  return { working: working, notes: notes };
}

// ============================================================
// SECTION 4: normalizePlaceName
// ============================================================

/**
 * normalizePlaceName — ล้างชื่อสถานที่
 * [FIX v003] Regex บ้าน → กัน false positive "บ้านโป่ง" "บ้านนา"
 */
function normalizePlaceName(rawPlace) {
  let working   = String(rawPlace || '').trim();
  const notes   = [];
  let placeType = 'other';

  if (!working) {
    return { cleanPlace: '', placeType, notes: [] };
  }

  // --- Step 1: ดึงเบอร์โทรและเลขเอกสารออก (เก็บลง Note) ---
  const phoneMatches = working.match(PHONE_PATTERN);
  if (phoneMatches) {
    phoneMatches.forEach(p => notes.push(p));
    working = working.replace(PHONE_PATTERN, '').trim();
  }
  const docMatches = working.match(DOC_NO_PATTERN);
  if (docMatches) {
    docMatches.forEach(d => notes.push(d));
    working = working.replace(DOC_NO_PATTERN, '').trim();
  }

  // --- Step 2: ตรวจจับประเภทสถานที่ ---
  if (/คอนโด|คอนโดมิเนียม|Condo|อาคารชุด/i.test(working)) {
    placeType = 'condo';
  } else if (/ห้างสรรพสินค้า|เซ็นทรัล|เทสโก้|โลตัส|มอลล์|Mall|Plaza|Center|Centre/i.test(working)) {
    placeType = 'mall';
  } else if (
    /หมู่บ้าน|บ้านเลขที่|^บ้าน\s|Village|Moo\s*[0-9]/i.test(working)
  ) {
    placeType = 'house';
  } else if (/ไซต์งาน|โครงการ|ก่อสร้าง|Site/i.test(working)) {
    placeType = 'site';
  }

  // --- Step 3: ดึง Delivery Notes ออก ---
  DELIVERY_NOTE_LIST.forEach(noteWord => {
    if (working.includes(noteWord)) {
      notes.push(noteWord);
      const safeNote = escapeRegex_(noteWord);
      working = working.replace(new RegExp(safeNote, 'g'), '').trim();
    }
  });

  // --- Step 4: ดึงพวก บจก./จำกัด ออก ---
  COMPANY_SUFFIX_LIST.forEach(suffix => {
    if (working.includes(suffix)) {
      notes.push(suffix);
      const safeSuffix = escapeRegex_(suffix);
      working = working.replace(new RegExp(safeSuffix, 'gi'), '').trim();
    }
  });

  working = working.replace(/\s+/g, ' ').trim();
  return { cleanPlace: working, placeType, notes };
}

// ============================================================
// SECTION 5: Phonetic & Compare
// ============================================================

/**
 * buildThaiPhoneticKey — สร้าง Phonetic Key จากชื่อไทย
 * [FIX v003] ลด Regex range ซ้อน: เดิม [\u0E30-\u0E4E\u0E47-\u0E4E]
 *            \u0E47-\u0E4E ซ้อนกับ \u0E30-\u0E4E อยู่แล้ว → ลดเป็นช่วงเดียว
 */
function buildThaiPhoneticKey(thaiName) {
  if (!thaiName) return '';
  // ลบสระและวรรณยุกต์ไทย (U+0E30–U+0E4E) และ space
  return thaiName.replace(/[\u0E30-\u0E4E\s]/g, '').substring(0, 6);
}

/**
 * normalizeForCompare — แปลงชื่อเพื่อเปรียบเทียบ
 */
function normalizeForCompare(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[.\-_]/g, '')
    .toLowerCase();
}

// ============================================================
// SECTION 6: Helper
// ============================================================

/**
 * escapeRegex_ — escape special chars สำหรับ new RegExp()
 */
function escapeRegex_(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * validatePersonName — [ADD v5.1.001] ตรวจสอบชื่อมีคุณภาพ
 * @public สาธารณะสำหรับ external caller / custom function
 */
function validatePersonName(name) {
  if (!name) return false;
  const normalized = String(name).toLowerCase().trim();
  if (normalized.length < 2) return false;
  if (/^[0-9]+$/.test(normalized)) return false;
  return true;
}

/**
 * validateAddress — [ADD v5.1.001] ตรวจสอบที่อยู่มีคุณภาพ
 * @public สาธารณะสำหรับ external caller / custom function
 */
function validateAddress(address) {
  if (!address) return false;
  const normalized = String(address).toLowerCase().trim();
  if (normalized.length < 5) return false;
  return true;
}
