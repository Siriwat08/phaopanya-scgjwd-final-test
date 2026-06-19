/**
 * VERSION: 5.5.014
 * FILE: 05_NormalizeService.gs
 * LMDS V5.5 — Thai Name & Place Normalization
 * ===================================================
 * PURPOSE:
 *   ทำความสะอาดและ normalize ชื่อบุคคลและสถานที่
 *   เป็น Single Source of Truth สำหรับการทำความสะอาดข้อมูล
 * ===================================================
 *   v5.5.014 (2026-06-19) — DRIVER VERIFIED COLUMNS + ALIAS ENRICHMENT:
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
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.001 (PH2 Hardening):
 *     - [FIX] buildThaiPhoneticKey: ลด Regex range ซ้อน
 *     - [FIX] normalizePersonNameFull: replace global (g flag)
 *     - [FIX] COMPANY_SUFFIX_LIST: sort longest-first
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
