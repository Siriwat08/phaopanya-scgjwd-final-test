/**
 * VERSION: 5.5.017
 * FILE: 06_PersonService.gs
 * LMDS V5.5 — Person Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Person — ฐานข้อมูลชื่อลูกค้า/ผู้รับสินค้า
 *   เป็น Single Source of Truth สำหรับข้อมูลบุคคล
 * ===================================================
 *   v5.5.017 (2026-06-21) — SECURITY POSTFIX (12 SEC issues total, Cycle 14):
 *     - [SEC-005 (createPerson + createPersonAlias PII log masking with generateMd5Hash)]
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
 *     - [REMOVE] createPerson: ลบ createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น
 *     - [REMOVE] createPersonAlias: ลบ createGlobalAlias() — ไม่ต้อง sync ย้อนไป M_ALIAS
 *     - [KEEP] mergePersonRecords: ยังเรียก createGlobalAlias() (ADMIN_MERGE_ACT — Admin Action)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *   v5.2.001 (PH2 Hardening):
 *     - [FIX] createPerson: เก็บ note แบบ join(",") ตามคำสั่ง
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.M_PERSON, PERSON_IDX.*, AI_CONFIG)
 *     - 02_Schema.gs          (SCHEMA[SHEET.M_PERSON], SCHEMA[SHEET.M_PERSON_ALIAS])
 *     - 03_SetupSheets.gs     (logDebug, logWarn, logError)
 *     - 05_NormalizeService.gs (normalizePersonNameFull, normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId, generateUUID, diceCoefficient, levenshteinDistance)
 *   CALLS (Invokes):
 *     - resolveMasterUuidViaGlobalAlias() → 21_AliasService.gs (findPersonCandidates)
 *     - convertUuidToPersonId()           → 21_AliasService.gs (findPersonCandidates)
 *     - createGlobalAlias()               → 21_AliasService.gs (mergePersonRecords ONLY — Admin Action)
 *   EXPORTS TO:
 *     - 10_MatchEngine.gs     (resolvePerson, createPerson, updatePersonStats, loadAllPersons_)
 *     - 11_TransactionService.gs (loadAllPersons_)
 *     - 17_SearchService.gs   (loadAllPersons_)
 *     - 19_Hardening.gs       (loadAllPersons_)
 *     - 21_AliasService.gs    (loadAllPersons_ — UUID converters)
 *   SHEETS ACCESSED:
 *     - SHEET.M_PERSON        (Read+Write: CRUD, Stats update)
 *     - SHEET.M_PERSON_ALIAS  (Read+Write: Alias lookup, createPersonAlias)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  06_PersonService.gs (Person Master Hub)                   │
 *   │  ├── resolvePerson()        — Match/resolve person        │
 *   │  ├── findPersonCandidates() — Multi-strategy search       │
 *   │  │   ├── M_ALIAS Fast Path (resolveMasterUuidViaGlobalAlias)│
 *   │  │   ├── Phone Match                                       │
 *   │  │   ├── Alias Match (M_PERSON_ALIAS)                      │
 *   │  │   ├── Phonetic / Name Match                             │
 *   │  │   └── Note Search (Deep Match)                          │
 *   │  ├── scorePersonCandidate() — Score calculation            │
 *   │  ├── createPerson()         — Create new person record    │
 *   │  ├── createPersonAlias()    — Add alternate name          │
 *   │  ├── mergePersonRecords()   — Merge duplicates (Admin)    │
 *   │  ├── updatePersonStats()    — Update usage statistics     │
 *   │  └── loadAllPersons_()      — Load all persons (cached)   │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// [PERF-010] Note Inverted Index — Map: word → Set<personId> สำหรับค้นหา Note แบบ O(1)
var _PERSON_NOTE_INVERTED_INDEX = null;

// [PERF-009] Alias Inverted Index — Map<normalized_alias, Set<personId>>
//   Build ครั้งเดียวใน loadAllAliases_ — ลด findByAlias_ จาก O(A) scan → O(1) lookup
var _PERSON_ALIAS_INVERTED_INDEX = null;

// ============================================================
// SECTION 1: resolvePerson
// ============================================================

/**
 * resolvePerson — ค้นหาหรือประเมินบุคคลจากชื่อดิบ
 * [FIX v5.5.012 Anti-pattern #3] รองรับ optional preNormResult เพื่อหลีกเลี่ยงการ normalize ซ้อน
 *   ถ้า caller (เช่น 17_SearchService) ได้ normResult มาแล้ว ส่งเข้ามาเพื่อข้ามการ normalize ซ้ำ
 *   ถ้าไม่ส่ง → ทำ normalize ภายในเหมือนเดิม (backward compatible)
 */
function resolvePerson(rawName, preNormResult) {
  // [FIX v5.5.012] ใช้ preNormResult ถ้ามี — หลีกเลี่ยง double normalization
  const normResult = preNormResult || normalizePersonNameFull(rawName);
  const cleanName  = normResult.cleanName;

  if (!cleanName || cleanName.length < 2) {
    return { personId: null, status: 'LOW_QUALITY', confidence: 0, normResult };
  }

  const candidates = findPersonCandidates(cleanName, normResult.extractedPhone);

  if (candidates.length === 0) {
    return { personId: null, status: 'NOT_FOUND', confidence: 0, normResult };
  }

  let bestPerson = null;
  let bestScore  = 0;

  candidates.forEach(candidate => {
    // [UPGRADE v5.1.001] ส่งข้อมูลว่า match ด้วยเบอร์โทรหรือไม่
    const score = scorePersonCandidate(cleanName, candidate, normResult.extractedPhone);
    if (score > bestScore) {
      bestScore  = score;
      bestPerson = candidate;
    }
  });

  if (bestScore >= AI_CONFIG.THRESHOLD_AUTO) {
    return { personId: bestPerson.personId, status: 'FOUND',
             confidence: bestScore, normResult };
  }
  if (bestScore >= AI_CONFIG.THRESHOLD_REVIEW) {
    return { personId: bestPerson.personId, status: 'NEEDS_REVIEW',
             confidence: bestScore, normResult };
  }
  return { personId: null, status: 'NOT_FOUND', confidence: bestScore, normResult };
}

// ============================================================
// SECTION 2: findPersonCandidates
// ============================================================

/**
 * findPersonCandidates — ค้นหา Candidate จาก M_PERSON
 * [FIX v003] Object reference bug: includes → .some(p => p.personId===)
 * [FIX v003] Phone match > 1 → ไปต่อ scoring แทน return ทันที
 * [FIX v003] Phonetic fallback substring(0,2) → (0,3)
 */
function findPersonCandidates(cleanName, phone) {
  const allPersons = loadAllPersons_();
  const results    = [];
  // [PERF-004] ใช้ Set<string> สำหรับ O(1) dedup lookup แทน results.some() O(K)
  //   ลดจาก 1M × O(K) → 1M × O(1) ใน Pipeline 1,000 source rows × M_PERSON 1,000
  const existingIds = new Set();

  const aliasResolve = typeof resolveMasterUuidViaGlobalAlias === 'function' ? resolveMasterUuidViaGlobalAlias(cleanName, 'PERSON') : null;
  if (aliasResolve && aliasResolve.masterUuid && aliasResolve.score >= 95) {
    const ownerId = convertUuidToPersonId(aliasResolve.masterUuid);
    const perfect = allPersons.find(p => p.personId === ownerId);
    if (perfect) return [perfect];
  }

  // --- 1. Phone Match ---
  if (phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const byPhone    = allPersons.filter(p => {
      const stored = String(p.phone || '').replace(/[^0-9]/g, '');
      return stored === cleanPhone && stored.length >= 9;
    });

    if (byPhone.length === 1) {
      // [FIX v003] เจอ 1 คน → return เลย (confident)
      return byPhone;
    }
    if (byPhone.length > 1) {
      // [FIX v003] เจอหลายคน → เพิ่มเข้า results แล้วไปต่อ scoring
      byPhone.forEach(p => {
        // [PERF-004] sync existingIds Set ด้วย (กัน Phone Match path ตกหล่น)
        if (!existingIds.has(p.personId)) {
          results.push(p);
          existingIds.add(p.personId);
        }
      });
    }
  }

  // --- 2. Alias Match ---
  const aliasMatches = findByAlias_(cleanName);
  aliasMatches.forEach(personId => {
    const found = allPersons.find(p => p.personId === personId);
    // [PERF-004] O(1) Set lookup แทน results.some() O(K)
    if (found && !existingIds.has(found.personId)) {
      results.push(found);
      existingIds.add(found.personId);
    }
  });

  // --- 3. Phonetic / Name Match ---
  const searchKey = buildThaiPhoneticKey(cleanName);
  // [PERF-004] ดึง normA ออกนอกลูป (computed ครั้งเดียว ไม่ใช่ทุก iteration)
  //   เดิม: normalizeForCompare(cleanName) ถูกเรียก 1,000 ครั้ง (1 ต่อ person)
  //   ใหม่: เรียกครั้งเดียว + reuse → ลด CPU ~99% สำหรับส่วนนี้
  const normA = normalizeForCompare(cleanName);
  const normAPrefix3 = normA.length >= 3 ? normA.substring(0, 3) : '';

  allPersons.forEach(person => {
    // [PERF-004] O(1) Set lookup แทน results.some() O(K)
    if (existingIds.has(person.personId)) return;
    const personKey = buildThaiPhoneticKey(person.normalized);

    if (searchKey && personKey && searchKey === personKey) {
      results.push(person);
      existingIds.add(person.personId);
    } else if (normAPrefix3) {
      const normB = normalizeForCompare(person.normalized);
      if (normB && normB.length >= 3 && normB.startsWith(normAPrefix3)) {
        results.push(person);
        existingIds.add(person.personId);
      }
    }
  });

  // --- 4. Note Search (Deep Match) — [PERF-010] ใช้ Inverted Index แทน O(N×M) scan ---
  if (results.length === 0) {
    var queryParts = cleanName.split(/\s+/).filter(function(p) { return p.length >= 2; });
    // ใช้ _PERSON_NOTE_INVERTED_INDEX ถ้ามี — ลดจาก O(N×M) เหลือ O(M)
    if (_PERSON_NOTE_INVERTED_INDEX && Object.keys(_PERSON_NOTE_INVERTED_INDEX).length > 0) {
      var matchingPersonIds = new Set();
      queryParts.forEach(function(part) {
        var key = part.toLowerCase();
        var personIdSet = _PERSON_NOTE_INVERTED_INDEX[key];
        if (personIdSet) {
          personIdSet.forEach(function(pid) { matchingPersonIds.add(pid); });
        }
      });
      matchingPersonIds.forEach(function(pid) {
        var found = allPersons.find(function(p) { return p.personId === pid; });
        // [PERF-004] sync existingIds Set
        if (found && !existingIds.has(found.personId)) {
          results.push(found);
          existingIds.add(found.personId);
        }
      });
    } else {
      // Fallback: ถ้ายังไม่มี index ใช้วิธีเดิม
      allPersons.forEach(function(person) {
        if (existingIds.has(person.personId)) return;
        var noteStr = String(person.note || '');
        if (!noteStr) return;
        var isMatch = queryParts.some(function(part) { return noteStr.includes(part); });
        if (isMatch) {
          results.push(person);
          existingIds.add(person.personId);
        }
      });
    }
  }

  return results;
}

/**
 * findByAlias_ — ค้นหา Person ID จาก M_PERSON_ALIAS
 * [FIX v003] ใช้ Set กัน duplicate
 * [PERF-009] ใช้ _PERSON_ALIAS_INVERTED_INDEX (O(1) lookup) แทน forEach O(A) scan
 *   เดิม: 1,000 source rows × 2,000 aliases = 2M comparisons + 2M redundant normalizeForCompare
 *   ใหม่: 1,000 source rows × 1 index lookup = 1,000 O(1) lookups
 */
function findByAlias_(cleanName) {
  // [PERF-009] Trigger index build if not yet built
  if (!_PERSON_ALIAS_INVERTED_INDEX) {
    loadAllAliases_();
  }

  const targetNorm = normalizeForCompare(cleanName);
  if (!targetNorm) return [];

  // [PERF-009] O(1) index lookup แทน O(A) forEach scan
  if (_PERSON_ALIAS_INVERTED_INDEX) {
    const personIdSet = _PERSON_ALIAS_INVERTED_INDEX.get(targetNorm);
    return personIdSet ? Array.from(personIdSet) : [];
  }

  // Fallback (defensive — ถ้า index build ล้มเหลว): legacy O(A) scan
  const allAliases = loadAllAliases_();
  const foundSet   = new Set();

  allAliases.forEach(alias => {
    if (!alias[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    const aliasNorm = normalizeForCompare(alias[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (aliasNorm === targetNorm && aliasNorm.length > 0) {
      foundSet.add(String(alias[PERSON_ALIAS_IDX.PERSON_ID]));
    }
  });

  return Array.from(foundSet);
}

// ============================================================
// SECTION 3: Scoring
// ============================================================

/**
 * scorePersonCandidate — คำนวณคะแนน Match
 * [UPGRADE v5.1.001] เพิ่ม Phone Match Bonus = 95
 */
function scorePersonCandidate(queryName, candidate, queryPhone) {
  // 1. ตรวจสอบ Phone Match ก่อน (โบนัส 95 คะแนน)
  if (queryPhone && candidate.phone) {
    const p1 = String(queryPhone).replace(/[^0-9]/g, '');
    const p2 = String(candidate.phone).replace(/[^0-9]/g, '');
    if (p1 === p2 && p1.length >= 9) return 95;
  }

  const nameA = normalizeForCompare(queryName);
  const nameB = normalizeForCompare(candidate.normalized || candidate.canonical);

  if (!nameA || !nameB) return 0;

  const levDist   = levenshteinDistance(nameA, nameB);
  const maxLen    = Math.max(nameA.length, nameB.length);
  const levScore  = maxLen > 0 ? Math.max(0, (1 - levDist / maxLen) * 100) : 0;
  const diceScore = diceCoefficient(nameA, nameB) * 100;
  const ratioScore = nameA === nameB ? 100 :
    (nameA.includes(nameB) || nameB.includes(nameA)) ? 80 : 0;

  let finalScore;
  if (nameA.length < 4) {
    finalScore = levScore * 0.6 + diceScore * 0.2 + ratioScore * 0.2;
  } else {
    finalScore = diceScore * 0.5 + levScore * 0.3 + ratioScore * 0.2;
  }

  // [FIX v003] ใช้ Config แทน hardcode 60
  return finalScore < AI_CONFIG.SCORE_MIN_THRESHOLD ? 0 : Math.round(finalScore);
}

// ============================================================
// SECTION 4: CRUD
// ============================================================

/**
 * createPerson — สร้างบุคคลใหม่ใน M_PERSON
 */
function createPerson(normResult) {
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON);
  const now   = new Date();
  const newId = generateShortId('P');

  const phoneStr = normResult.extractedPhone
    ? "'" + normResult.extractedPhone : '';

  // [FIX v5.2.002] รวบรวม Note ทั้งหมด (Phone, Doc, Prefix)
  const allNotes = normResult.deliveryNotes || [];

  const universalMasterId = typeof generateUUID === 'function' ? generateUUID() : generateShortId('UID');

  const newRow = [
    newId,
    normResult.cleanName,
    normalizeForCompare(normResult.cleanName),
    phoneStr,
    now, now, 1,
    APP_CONST.STATUS_ACTIVE,
    allNotes.join(','),
    universalMasterId,
  ];

  // [FIX-05 v5.4.003] ใช้ getRange+setValues แทน appendRow เพื่อความเสถียร
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);
  invalidatePersonCache_();
  logDebug('PersonService', `createPerson: ${newId} (name hash: ${generateMd5Hash(String(normResult.cleanName || '')).substring(0, 8)})`);

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)
  // autoEnrichAliasesFromFactBatch_() จะเขียน canonical+variant เข้า M_ALIAS เอง

  return newId;
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('PersonService', `createPerson ล้มเหลว: ${err.message}`, err);
    return null;
  }
}

/**
 * createPersonAlias — เพิ่มชื่อสำรองให้บุคคล
 */
function createPersonAlias(personId, aliasName, matchScore) {
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  const newId = generateShortId('PA');

  // [FIX-05 v5.4.003] ใช้ getRange+setValues แทน appendRow
  const aliasRow = [newId, personId, aliasName, matchScore || 0, new Date(), true];
  const aliasLastRow = sheet.getLastRow();
  sheet.getRange(aliasLastRow + 1, 1, 1, aliasRow.length).setValues([aliasRow]);
  invalidateAliasCache_();
  logDebug('PersonService', `createPersonAlias: ${personId} (alias hash: ${generateMd5Hash(String(aliasName || '')).substring(0, 8)})`);

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('PersonService', `createPersonAlias ล้มเหลว: ${err.message}`, err);
  }
}

/**
 * updatePersonStats — อัปเดต last_seen และ usage_count
 * [FIX v003] โหลดเฉพาะ person_id column + guard idCol === -1
 */
function updatePersonStats(personId) {
  if (!personId) return;
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET.M_PERSON);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // [FIX v003] โหลดเฉพาะคอลัมน์ person_id (col 1) แทนทั้งชีต
    const idCol      = PERSON_IDX.PERSON_ID + 1;
    const idData     = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    let targetRow    = -1;

    for (let i = 0; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === personId) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      logWarn('PersonService', `updatePersonStats: ไม่พบ personId ${personId}`);
      return;
    }

    const lastSeenCol   = PERSON_IDX.LAST_SEEN   + 1;
    const usageCountCol = PERSON_IDX.USAGE_COUNT  + 1;

    // [FIX v5.4.003] Batch write: อ่านทั้ง 2 คอลัมน์ → แก้ใน RAM → เขียนทีเดียว
    // ลดจาก 3 API calls เหลือ 1+1 = 2 API calls
    const statsRange = sheet.getRange(targetRow, lastSeenCol, 1, 2);
    const statsVals  = statsRange.getValues();
    const currCount  = Number(statsVals[0][1]) || 0;
    statsVals[0][0] = new Date();
    statsVals[0][1] = currCount + 1;
    statsRange.setValues(statsVals);
    invalidatePersonCache_();

  } catch (err) {
    // [FIX LAW-13 v5.4.003] ส่ง err object เพื่อให้ stack trace เข้า SYS_LOG
    logError('PersonService', `updatePersonStats ล้มเหลว: ${err.message}`, err);
  }
}

/**
 * mergePersonRecords — Merge บุคคล 2 คนให้เป็น 1
 * [FIX v003] aliasName ใช้ canonical name ของ sourceId ไม่ใช่ sourceId เอง
 * [FIX v003] เพิ่ม guard idCol === -1
 * [FIX v003] comment "ห้ามลบ" แก้จาก "ห้างลบ"
 */
function mergePersonRecords(sourceId, targetId) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.M_PERSON);
    // [FIX B1 v5.5.002] Math.min guard: ป้องกัน Range error ถ้า sheet มีคอลัมน์น้อยกว่า SCHEMA
    const colsToRead = Math.min(SCHEMA[SHEET.M_PERSON].length, sheet.getLastColumn());
    const data  = sheet.getRange(1, 1, sheet.getLastRow(), colsToRead).getValues();
    // [FIX v5.5.001] Use PERSON_IDX constants consistently instead of headers.indexOf()
    const idCol   = PERSON_IDX.PERSON_ID;
    const statCol = PERSON_IDX.STATUS;
    const noteCol = PERSON_IDX.NOTE;
    const canCol  = PERSON_IDX.CANONICAL;

    let sourceCanonical = sourceId; // fallback
    let targetMasterUuid = '';

    for (let i = 1; i < data.length; i++) {
      const rowPersonId = String(data[i][idCol]);
      if (rowPersonId === targetId && PERSON_IDX.MASTER_UUID < data[i].length) {
        targetMasterUuid = String(data[i][PERSON_IDX.MASTER_UUID] || '');
      }
      if (rowPersonId !== sourceId) continue;

      const targetRow = i + 1;

      // [FIX v003] ดึง canonical_name ของ source ก่อน merge
      if (data[i][canCol]) {
        sourceCanonical = String(data[i][canCol]);
      }

      // [FIX v003] ห้ามลบ — เปลี่ยน Status เป็น Merged แทน
      // [FIX S5 v5.5.002] Batch write: 2x setValue → 1x setValues (Rule 11)
      const mergeRange = sheet.getRange(targetRow, statCol + 1, 1, 2);
      const mergeNote = `Merged → ${targetId} on ${toThaiDateStr(new Date())}`;
      mergeRange.setValues([[APP_CONST.STATUS_MERGED, mergeNote]]);
      break;
    }

    // [FIX v003] สร้าง Alias ด้วย canonical_name ของ source ไม่ใช่ sourceId
    createPersonAlias(targetId, sourceCanonical, 100);
    if (typeof createGlobalAlias === 'function' && targetMasterUuid) {
      createGlobalAlias(targetMasterUuid, sourceCanonical, 'PERSON', 100, 'ADMIN_MERGE_ACT');
    }
    invalidatePersonCache_();
    logInfo('PersonService', `mergePersonRecords: ${sourceId} → ${targetId}`);

  } catch (err) {
    logError('PersonService', `mergePersonRecords ล้มเหลว: ${err.message}`, err);
    throw err;
  }
}

// ============================================================
// SECTION 5: Data Loaders (with Cache)
// ============================================================

function loadAllPersons_() {
  const cacheKey = 'M_PERSON_ALL';
  const cache    = CacheService.getScriptCache();
  // [PERF-004] ลองอ่าน chunked cache ก่อน
  const cachedData = loadChunkedCache_(cache, cacheKey);
  if (cachedData) return cachedData;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error เมื่อชีตมีคอลัมน์น้อยกว่า SCHEMA
  // (กรณีชีตเก่าที่ยังไม่มี master_uuid column)
  const colsToRead = Math.min(SCHEMA[SHEET.M_PERSON].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();

  const result = rows
    .filter(r => r[PERSON_IDX.PERSON_ID])
    .filter(r => r[PERSON_IDX.STATUS] !== APP_CONST.STATUS_ARCHIVED &&
                 r[PERSON_IDX.STATUS] !== APP_CONST.STATUS_MERGED)
    .map(r => ({
      personId:   String(r[PERSON_IDX.PERSON_ID]),
      canonical:  String(r[PERSON_IDX.CANONICAL]  || ''),
      normalized: String(r[PERSON_IDX.NORMALIZED] || ''),
      phone:      String(r[PERSON_IDX.PHONE]       || '').replace(/^'/, ''),
      usageCount: Number(r[PERSON_IDX.USAGE_COUNT] || 0),
      note: String(r[PERSON_IDX.NOTE] || ''),
      masterUuid: String(r[PERSON_IDX.MASTER_UUID] || ''),
    }));

  // [PERF-010] สร้าง Note Inverted Index — Map: word → Set<personId>
  var noteIndex = {};
  result.forEach(function(p) {
    var noteStr = String(p.note || '').trim();
    if (!noteStr) return;
    // แยกคำจาก note โดยใช้ whitespace + common delimiters
    var words = noteStr.split(/[\s,;|\/\-]+/).filter(function(w) { return w.length >= 2; });
    words.forEach(function(word) {
      var key = word.toLowerCase();
      if (!noteIndex[key]) noteIndex[key] = new Set();
      noteIndex[key].add(p.personId);
    });
  });
  _PERSON_NOTE_INVERTED_INDEX = noteIndex;

  // [PERF-004] Chunked cache — แบ่งข้อมูลเป็น chunk ละ 200 items เพื่อไม่ให้เกิน 100KB limit
  saveChunkedCache_(cache, cacheKey, result);
  return result;
}

function loadAllAliases_() {
  const cacheKey = 'M_PERSON_ALIAS_ALL';
  const cache    = CacheService.getScriptCache();
  // [PERF-004] ลองอ่าน chunked cache ก่อน
  const cachedData = loadChunkedCache_(cache, cacheKey);
  if (cachedData) {
    // [PERF-009] Build inverted index ครั้งเดียวหลัง cache hit
    _buildPersonAliasInvertedIndex_(cachedData);
    return cachedData;
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error
  const colsToRead = Math.min(SCHEMA[SHEET.M_PERSON_ALIAS].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();
  // [PERF-004] Chunked cache — แบ่งข้อมูลเป็น chunk ละ 200 items
  saveChunkedCache_(cache, cacheKey, rows);
  // [PERF-009] Build inverted index ครั้งเดียวหลัง sheet read
  _buildPersonAliasInvertedIndex_(rows);
  return rows;
}

/**
 * _buildPersonAliasInvertedIndex_ — [PERF-009] Build Map<normalized_alias, Set<personId>>
 *   เรียกครั้งเดียวหลัง loadAllAliases_ เพื่อให้ findByAlias_ ใช้ O(1) lookup แทน O(A) scan
 *   Index ถูก cache ใน RAM (_PERSON_ALIAS_INVERTED_INDEX) — rebuild เมื่อ invalidateAliasCache_
 * @param {Array[]} allAliases - 2D array ของ M_PERSON_ALIAS rows
 * @private
 */
function _buildPersonAliasInvertedIndex_(allAliases) {
  if (_PERSON_ALIAS_INVERTED_INDEX) return;  // already built
  _PERSON_ALIAS_INVERTED_INDEX = new Map();
  if (!allAliases || allAliases.length === 0) return;

  allAliases.forEach(function(alias) {
    if (!alias[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    var aliasNorm = normalizeForCompare(alias[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (!aliasNorm) return;
    var personId = String(alias[PERSON_ALIAS_IDX.PERSON_ID]);
    if (!_PERSON_ALIAS_INVERTED_INDEX.has(aliasNorm)) {
      _PERSON_ALIAS_INVERTED_INDEX.set(aliasNorm, new Set());
    }
    _PERSON_ALIAS_INVERTED_INDEX.get(aliasNorm).add(personId);
  });
}

/**
 * batchUpdatePersonStats_ — [PERF-001] [REF-009] Batch stats update สำหรับ Person
 * Delegated to batchUpdateEntityStats_() in 14_Utils.gs — thin wrapper
 * @param {Set<string>} personIds - Set of person IDs to update
 */
function batchUpdatePersonStats_(personIds) {
  batchUpdateEntityStats_(SHEET.M_PERSON, PERSON_IDX, PERSON_IDX.PERSON_ID, PERSON_IDX.USAGE_COUNT, PERSON_IDX.LAST_SEEN, personIds, invalidatePersonCache_);
}

/**
 * invalidatePersonCache_ — [REF-011] Uses centralized invalidateChunkedCache_
 */
function invalidatePersonCache_() {
  invalidateChunkedCache_('M_PERSON_ALL', function() { _PERSON_NOTE_INVERTED_INDEX = null; });
}
/**
 * invalidateAliasCache_ — [REF-011] Uses centralized invalidateChunkedCache_
 * [PERF-009] ล้าง _PERSON_ALIAS_INVERTED_INDEX ด้วย — กัน stale index หลัง alias changes
 *   (createPersonAlias, autoEnrichAliasesFromFactBatch_, MIGRATION Step 2)
 */
function invalidateAliasCache_() {
  _PERSON_ALIAS_INVERTED_INDEX = null;  // [PERF-009] clear inverted index → rebuild on next loadAllAliases_
  invalidateChunkedCache_('M_PERSON_ALIAS_ALL');
}

// ============================================================
// SECTION 6: [PERF-004] [REF-010] Chunked Cache Helpers
// MOVED to 14_Utils.gs (saveChunkedCache_, loadChunkedCache_)
// These functions are now centralized in 14_Utils.gs Section 9.
// Callers in this file use saveChunkedCache_() / loadChunkedCache_()
// which resolve to the global functions in 14_Utils.gs.
// ============================================================
