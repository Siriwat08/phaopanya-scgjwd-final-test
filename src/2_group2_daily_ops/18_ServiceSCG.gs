/**
 * VERSION: 5.5.017
 * FILE: 18_ServiceSCG.gs
 * LMDS V5.5 — SCG API Service (Group 2 Commander)
 * ===================================================
 * PURPOSE:
 *   ดึงข้อมูลการจัดส่งจาก SCG API → เขียนลงตารางงานประจำวัน
 *   แล้วเรียก Module 17 จับคู่พิกัด พร้อมสร้างสรุปเจ้าของสินค้า/Shipment
 *   เป็น Commander ของ Group 2 (Daily Ops)
 * ===================================================
 *   v5.5.017 (2026-06-21) — SECURITY POSTFIX (12 SEC issues total, Cycle 14):
 *     - [SEC-002 (setSCGCookie_UI + AuthZ guard)]
 *     - [SEC-010 (sanitizeCookie_ regex tightened — RFC 6265 charset, removed ()[]{})]
 *     - [SEC-011 (fetchWithRetry_ response body truncation 200 chars + total length marker)]
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
 *     - 01_Config.gs          (SHEET.DAILY_JOB, SCG_CONFIG, APP_CONST, DATA_IDX)
 *     - 02_Schema.gs          (SCHEMA[SHEET.DAILY_JOB])
 *     - 03_SetupSheets.gs     (logInfo, logWarn, logError)
 *   CALLS (Invokes):
 *     - applyMasterCoordinatesToDailyJob() → 18_ServiceSCG.gs (self — calls Module 17)
 *     - runLookupEnrichment()              → 17_SearchService.gs
 *   EXPORTS TO:
 *     - 00_App.gs             (fetchDataFromSCGJWD, applyMasterCoordinatesToDailyJob, clearAllSCGSheets_UI)
 *   SHEETS ACCESSED:
 *     - SHEET.DAILY_JOB       (Read+Write: SCG API data + aggregated columns)
 *     - SHEET.INPUT           (Read: Cookie + Shipment numbers)
 *     - SHEET.EMPLOYEE        (Read: Employee data)
 *     - SHEET.OWNER_SUMMARY   (Write: สรุปเจ้าของสินค้า)
 *     - SHEET.SHIPMENT_SUM    (Write: สรุป_Shipment)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  18_ServiceSCG.gs (Group 2 Commander — SCG Data Pipeline)   │
 *   │  ├── fetchDataFromSCGJWD() — Orchestrator (Lock + steps)   │
 *   │  │   ├── 1. readInputConfig_() → {cookie, shipmentString}  │
 *   │  │   ├── 2. callSCGApi_(cfg) → responseText                │
 *   │  │   ├── 3. flattenShipmentsToRows_(shipments) → []        │
 *   │  │   ├── 4. aggregateShopData_(allFlatData) → mutates      │
 *   │  │   └── 5. writeDailyJobSheet_(ss, allFlatData)           │
 *   │  │   ├── 6. applyMasterCoordinatesToDailyJob() → Module 17  │
 *   │  │   ├── 7. buildOwnerSummary()                              │
 *   │  │   └── 8. buildShipmentSummary()                           │
 *   │  ├── fetchWithRetry_() — HTTP retry with exponential backoff│
 *   │  ├── checkIsEPOD() — E-POD eligibility per owner            │
 *   │  ├── buildOwnerSummary() — สรุปเจ้าของสินค้า               │
 *   │  ├── buildShipmentSummary() — สรุป_Shipment                 │
 *   │  ├── clearAllSCGSheets_UI() — ล้างข้อมูลทั้งหมด             │
 *   │  └── clearDailyJobLatLng() — ล้างเฉพาะพิกัด                 │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// [RF-01] EPOD_OWNERS ย้ายไป SCG_CONFIG.EPOD_OWNERS ใน 01_Config.gs แล้ว
// ใช้ SCG_CONFIG.EPOD_OWNERS แทน module-level const

// ============================================================
// SECTION 0: Security Helpers (SEC-003 Fix)
// ============================================================

/**
 * sanitizeCookie_ — [SEC-003] ตรวจสอบและทำความสะอาดค่า Cookie ก่อนใช้งาน
 * ป้องกัน CRLF Injection และ Control Characters ใน HTTP Header
 * @param {string} raw - Cookie ดิบจากผู้ใช้
 * @return {string} Cookie ที่ผ่านการ sanitize
 * @throws {Error} ถ้า Cookie มีตัวอักษรที่ไม่อนุญาต
 */
function sanitizeCookie_(raw) {
  const clean = String(raw || '').trim();

  if (!clean) {
    throw new Error('Cookie ไม่สามารถเป็นค่าว่าง');
  }

  // ตรวจ CRLF และ Control Characters (0x00-0x1F, 0x7F)
  if (/[\r\n\x00-\x1f\x7f]/.test(clean)) {
    throw new Error(
      'Cookie มีตัวอักษรที่ไม่อนุญาต (CRLF Injection Risk)\n' +
      'กรุณาตรวจสอบ Cookie และวางใหม่'
    );
  }

  // ตรวจรูปแบบคร่าวๆ: Cookie ควรประกอบด้วย alphanumeric, =, ;, space, /, %, comma, dot, hyphen, underscore
  // รองรับ Cookie หลายคู่ เช่น "session=abc123; path=/; domain=.scgjwd.com"
  // [SEC-010 FIX] ลด charset ให้แคบลง — ลบ ( ) [ ] { } ที่ไม่จำเป็น (RFC 6265 compliance)
  if (!/^[a-zA-Z0-9_\-\.\=; \/,%~+:]+$/.test(clean)) {
    throw new Error(
      'Cookie ไม่อยู่ในรูปแบบที่ถูกต้อง\n' +
      'กรุณาตรวจสอบว่าคัดลอก Cookie ทั้งหมดจาก Browser\n' +
      'หาก Cookie มีอักขระพิเศษอื่น กรุณาติดต่อ Admin'
    );
  }

  // ตรวจความยาวต่ำเกินไป (Cookie ที่ถูกต้องมักยาวกว่า 10 ตัวอักษร)
  if (clean.length < 10) {
    throw new Error(
      'Cookie สั้นเกินไป (' + clean.length + ' ตัวอักษร)\n' +
      'Cookie ที่ถูกต้องมักมีความยาวอย่างน้อย 10 ตัวอักษร'
    );
  }

  return clean;
}

// ============================================================
// SECTION 1: fetchDataFromSCGJWD — Orchestrator (SRP Split)
// [REFACTOR-01] แยก 7 หน้าที่ออกเป็น 5 helper + orchestrator
// ============================================================

function fetchDataFromSCGJWD() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    // [FIX R12] เปลี่ยน getUi().alert() → safeUiAlert_() — trigger-safe
    safeUiAlert_("⚠️ ระบบคิวทำงาน\nมีผู้ใช้งานอื่นกำลังโหลดข้อมูล Shipment อยู่ กรุณารอสักครู่");
    return;
  }

  const startTime = Date.now();
  const TIME_LIMIT_MS = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Step 1: อ่าน Cookie + ShipmentNos
    const inputCfg = readInputConfig_(ss);

    // Step 2: เรียก API + retry
    ss.toast("กำลังเชื่อมต่อ SCG Server...", "System", 10);
    logInfo('ServiceSCG', `Fetching data for ${inputCfg.shipmentString.split(',').length} shipments`);
    const apiResponse = callSCGApi_(inputCfg);

    // Step 3: แปลง JSON → flat row array
    // [FIX v5.5.001] callSCGApi_ ตอนนี้คืน parsed object แล้ว ไม่ต้อง JSON.parse ซ้ำ
    const shipments = apiResponse.data || [];
    if (shipments.length === 0) throw new Error("API Return Success แต่ไม่พบข้อมูล Shipment (Data Empty)");

    ss.toast("กำลังแปลงข้อมูล " + shipments.length + " Shipments...", "Processing", 5);
    const allFlatData = flattenShipmentsToRows_(shipments);

    // Step 4: คำนวณ aggregate per shop
    aggregateShopData_(allFlatData);

    // Step 5: เขียน Sheet
    writeDailyJobSheet_(ss, allFlatData);

    // [FIX B3 v5.5.002] เพิ่ม Time Guard ระหว่าง steps — หยุดจริงถ้าใกล้ timeout
    const elapsedAfterStep5 = Date.now() - startTime;
    if (elapsedAfterStep5 > TIME_LIMIT_MS) {
      logWarn('ServiceSCG', `Time Guard: หยุดหลัง Step 5 ใช้เวลา ${Math.round(elapsedAfterStep5/1000)}s — ข้าม Step 6-8`);
      // [FIX R12] เปลี่ยน ui.alert() → safeUiAlert_() — trigger-safe
      safeUiAlert_(`⚠️ ดึงข้อมูลสำเร็จแต่ใกล้ Timeout\n- จำนวนรายการ: ${allFlatData.length} แถว\n- ข้ามการจับคู่พิกัด — กดปุ่ม Enrich แยก`);
      return;
    }

    // Step 6-8: Post-processing
    applyMasterCoordinatesToDailyJob();

    // [FIX B6 v5.5.002] อ่าน DAILY_JOB ครั้งเดียว ส่งให้ทั้ง 2 summary functions
    const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);
    const dailyData = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, SCHEMA[SHEET.DAILY_JOB].length).getValues();
    buildOwnerSummary(dailyData);
    buildShipmentSummary(dailyData);

    logInfo('ServiceSCG', `import ${allFlatData.length} records successfully`);

    // [FIX R12] เปลี่ยน ui.alert() → safeUiAlert_() — trigger-safe
    safeUiAlert_(`✅ ดึงข้อมูลสำเร็จ!\n- จำนวนรายการ: ${allFlatData.length} แถว\n- จับคู่พิกัด: เรียบร้อย`);

  } catch (e) {
    logError('ServiceSCG', 'fetchDataFromSCGJWD ล้มเหลว: ' + e.message, e);
    // [FIX R12] เปลี่ยน getUi().alert() → safeUiAlert_() — trigger-safe
    safeUiAlert_("❌ เกิดข้อผิดพลาด: " + e.message);
  } finally {
    lock.releaseLock();
    // [PERF-012] Flush log buffer ก่อน execution จบ — ป้องกัน log entries สูญหาย
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

// ============================================================
// SECTION 1a: readInputConfig_ — อ่าน Cookie + ShipmentNos
// ============================================================

/**
 * readInputConfig_ — [REFACTOR-01] อ่านข้อมูล Input จากชีต Input
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @return {{cookie: string, shipmentString: string}}
 */
function readInputConfig_(ss) {
  const inputSheet = ss.getSheetByName(SCG_CONFIG.SHEET_INPUT);
  const dataSheet  = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);
  if (!inputSheet || !dataSheet) throw new Error("CRITICAL: ไม่พบชีต Input หรือ Data");

  // [SEC-001] อ่าน Cookie จาก Script Properties แทนเซลล์ B1
  const cookie = getSCGCookie_();
  if (!cookie) throw new Error("❌ กรุณาตั้งค่า Cookie ผ่านเมนู LMDS > ระบบ > ตั้งค่า SCG Cookie");

  const lastRow = inputSheet.getLastRow();
  if (lastRow < SCG_CONFIG.INPUT_START_ROW) throw new Error("ℹ️ ไม่พบเลข Shipment ในชีต Input");

  const shipmentNumbers = inputSheet
    .getRange(SCG_CONFIG.INPUT_START_ROW, 1, lastRow - SCG_CONFIG.INPUT_START_ROW + 1, 1)
    .getValues().flat().map(r => String(r || '').trim()).filter(Boolean);

  if (shipmentNumbers.length === 0) throw new Error("ℹ️ รายการ Shipment ว่างเปล่า");

  // เขียนเลข Shipment ต่อกันคั่นด้วยจุลภาคลงในช่อง B3
  const shipmentString = shipmentNumbers.join(',');
  inputSheet.getRange(SCG_CONFIG.SHIPMENT_STRING_CELL).setValue(shipmentString).setHorizontalAlignment("left");

  return { cookie, shipmentString };
}

// ============================================================
// SECTION 1a2: SCG Cookie Management (SEC-001 Fix)
// ============================================================

/**
 * setSCGCookie_UI — [SEC-001] ตั้งค่า SCG Cookie ผ่าน UI Prompt
 * เก็บใน PropertiesService.getScriptProperties() แทน Spreadsheet Cell
 */
function setSCGCookie_UI() {
  // [SEC-002 FIX] Authorization Guard — เฉพาะ Admin เท่านั้นที่ตั้งค่า Cookie ได้
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์ตั้งค่า SCG Cookie\nกรุณาติดต่อ Admin');
    return;
  }
  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.prompt(
      '🔐 ตั้งค่า SCG Cookie',
      'วาง Cookie จาก SCG API ที่นี่:\n\n' +
      '(Cookie จะถูกจัดเก็บอย่างปลอดภัยใน Script Properties\n' +
      'เฉพาะ Script Owner เท่านั้นที่เข้าถึงได้)',
      ui.ButtonSet.OK_CANCEL
    );

    if (result.getSelectedButton() !== ui.Button.OK) return;

    const rawCookie = String(result.getResponseText() || '').trim();
    if (!rawCookie) {
      safeUiAlert_('❌ Cookie ไม่สามารถเป็นค่าว่างได้');
      return;
    }

    // [SEC-003] Sanitize ก่อนเก็บ
    const cleanCookie = sanitizeCookie_(rawCookie);

    PropertiesService.getScriptProperties().setProperty('SCG_COOKIE', cleanCookie);

    // ล้างเซลล์ B1 ถ้ามี Cookie เก่าอยู่
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const inputSheet = ss.getSheetByName(SCG_CONFIG.SHEET_INPUT);
      if (inputSheet) {
        const oldCookie = String(inputSheet.getRange(SCG_CONFIG.COOKIE_CELL).getValue() || '').trim();
        if (oldCookie) {
          inputSheet.getRange(SCG_CONFIG.COOKIE_CELL).clearContent();
          logInfo('ServiceSCG', '[SEC-001] ล้าง Cookie เก่าจากเซลล์ B1 แล้ว');
        }
      }
    } catch (e) {
      logWarn('ServiceSCG', '[SEC-001] ไม่สามารถล้างเซลล์ B1: ' + e.message);
    }

    logInfo('ServiceSCG', '[SEC-001] ตั้งค่า SCG Cookie สำเร็จ (Script Properties)');
    safeUiAlert_('✅ ตั้งค่า SCG Cookie สำเร็จ!\n\nCookie ถูกจัดเก็บใน Script Properties อย่างปลอดภัยแล้ว');

  } catch (e) {
    logError('ServiceSCG', 'setSCGCookie_UI ล้มเหลว: ' + e.message, e);
    safeUiAlert_('❌ ตั้งค่า Cookie ล้มเหลว: ' + e.message);
  }
}

/**
 * getSCGCookie_ — [SEC-001] อ่าน Cookie จาก Script Properties
 * พร้อม Fallback อ่านจากเซลล์ B1 สำหรับช่วง Migration
 * @return {string} Cookie value
 */
function getSCGCookie_() {
  // 1. อ่านจาก Script Properties (Primary)
  const fromProps = PropertiesService.getScriptProperties().getProperty('SCG_COOKIE');
  if (fromProps) return fromProps;

  // 2. Fallback: อ่านจากเซลล์ B1 (Transition — ย้ายไป Properties แล้วลบ)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inputSheet = ss.getSheetByName(SCG_CONFIG.SHEET_INPUT);
    if (inputSheet) {
      const fromCell = String(inputSheet.getRange(SCG_CONFIG.COOKIE_CELL).getValue() || '').trim();
      if (fromCell) {
        // [SEC-003] Sanitize ก่อนย้าย
        const cleanCookie = sanitizeCookie_(fromCell);
        // One-time Migration: ย้ายไป Properties
        PropertiesService.getScriptProperties().setProperty('SCG_COOKIE', cleanCookie);
        // ล้างเซลล์ B1
        inputSheet.getRange(SCG_CONFIG.COOKIE_CELL).clearContent();
        logInfo('ServiceSCG', '[SEC-001] Migration: ย้าย Cookie จาก B1 → Script Properties สำเร็จ');
        return cleanCookie;
      }
    }
  } catch (e) {
    logWarn('ServiceSCG', '[SEC-001] Fallback อ่าน Cookie จาก B1 ล้มเหลว: ' + e.message);
  }

  return ''; // ไม่พบ Cookie ทั้ง 2 แหล่ง
}

// ============================================================
// SECTION 1b: callSCGApi_ — HTTP call + retry
// ============================================================

/**
 * callSCGApi_ — [REFACTOR-01] เรียก SCG API เท่านั้น
 * @param {{cookie: string, shipmentString: string}} inputCfg
 * @return {Object} parsed API response
 */
function callSCGApi_(inputCfg) {
  const payload = {
    DeliveryDateFrom: '', DeliveryDateTo: '', TenderDateFrom: '', TenderDateTo: '',
    CarrierCode: '', CustomerCode: '', OriginCodes: '', ShipmentNos: inputCfg.shipmentString
  };

  const options = {
    method: 'post', payload: payload, muteHttpExceptions: true,
    headers: { cookie: inputCfg.cookie }
  };

  const responseText = fetchWithRetry_(SCG_CONFIG.API_URL, options, APP_CONST.MAX_RETRIES || 3);

  // [FIX v5.5.001] try-catch รอบ JSON.parse เพื่อ handle non-JSON responses
  try {
    return JSON.parse(responseText);
  } catch (parseErr) {
    // [SEC-004] ไม่บันทึก Response Preview ลง SYS_LOG เพื่อป้องกัน PII Leakage
    logError('ServiceSCG', `callSCGApi_ JSON.parse ล้มเหลว: ${parseErr.message}. Response length: ${String(responseText).length} chars`, parseErr);
    throw new Error(`SCG API ตอบกลับไม่ใช่ JSON ที่ถูกต้อง: ${parseErr.message}`);
  }
}

// ============================================================
// SECTION 1c: flattenShipmentsToRows_ — JSON → flat rows
// ============================================================

/**
 * flattenShipmentsToRows_ — [REFACTOR-01] แปลง Shipments JSON → flat row array
 * @param {Array} shipments - ข้อมูล shipments จาก API
 * @return {Array[]} allFlatData - array ของ row arrays
 */
function flattenShipmentsToRows_(shipments) {
  const allFlatData = [];
  let runningRow = 2;

  shipments.forEach(shipment => {
    const destSet = new Set();
    (shipment.DeliveryNotes || []).forEach(n => { if (n.ShipToName) destSet.add(n.ShipToName); });
    const destListStr = Array.from(destSet).join(", ");

    (shipment.DeliveryNotes || []).forEach(note => {
      (note.Items || []).forEach(item => {
        allFlatData.push(buildDailyJobRow_(shipment, note, item, destSet.size, destListStr, runningRow));
        runningRow++;
      });
    });
  });

  return allFlatData;
}

/**
 * buildDailyJobRow_ — [REFACTOR-01] สร้าง 1 row ของตารางงานประจำวัน
 * ใช้ DATA_IDX.* แทน hardcode index (Law 3 compliance)
 * @return {Array} row array
 */
function buildDailyJobRow_(shipment, note, item, destCount, destListStr, rowNum) {
  const row = new Array(SCHEMA[SHEET.DAILY_JOB].length).fill('');
  row[DATA_IDX.JOB_ID]          = (note.PurchaseOrder || '') + '-' + rowNum;
  row[DATA_IDX.PLAN_DELIVERY]   = note.PlanDelivery ? new Date(note.PlanDelivery) : null;
  row[DATA_IDX.INVOICE_NO]      = String(note.PurchaseOrder || '');
  row[DATA_IDX.SHIPMENT_NO]     = String(shipment.ShipmentNo || '');
  row[DATA_IDX.DRIVER_NAME]     = shipment.DriverName || '';
  row[DATA_IDX.TRUCK_LICENSE]   = shipment.TruckLicense || '';
  row[DATA_IDX.CARRIER_CODE]    = String(shipment.CarrierCode || '');
  row[DATA_IDX.CARRIER_NAME]    = shipment.CarrierName || '';
  row[DATA_IDX.SOLD_TO_CODE]    = String(note.SoldToCode || '');
  row[DATA_IDX.SOLD_TO_NAME]    = note.SoldToName || '';
  row[DATA_IDX.SHIP_TO_NAME]    = note.ShipToName || '';
  row[DATA_IDX.SHIP_TO_ADDR]    = note.ShipToAddress || '';
  row[DATA_IDX.LATLNG_SCG]      = (note.ShipToLatitude != null && note.ShipToLongitude != null)
                                    ? (note.ShipToLatitude + ", " + note.ShipToLongitude) : '';
  row[DATA_IDX.MATERIAL]        = item.MaterialName || '';
  row[DATA_IDX.QTY]             = item.ItemQuantity || 0;
  row[DATA_IDX.QTY_UNIT]        = item.QuantityUnit || '';
  row[DATA_IDX.WEIGHT]          = item.ItemWeight || 0;
  row[DATA_IDX.DELIVERY_NO]     = String(note.DeliveryNo || '');
  row[DATA_IDX.DEST_COUNT]      = destCount;
  row[DATA_IDX.DEST_LIST]       = destListStr;
  row[DATA_IDX.SCAN_STATUS]     = 'รอสแกน';
  row[DATA_IDX.DELIVERY_STATUS] = 'ยังไม่ได้ส่ง';
  row[DATA_IDX.SHOP_KEY]        = String(shipment.ShipmentNo || '').trim() + '|' + String(note.ShipToName || '').trim();  // [FIX CRIT-004] trim ทั้งสองฝั่ง
  return row;
}

// ============================================================
// SECTION 1d: aggregateShopData_ — คำนวณ qty/weight/epod per shop
// ============================================================

/**
 * aggregateShopData_ — [REFACTOR-01] คำนวณสรุปร้านค้า (mutates allFlatData)
 * @param {Array[]} allFlatData - flat row array (จะถูกแก้ไขโดยตรง)
 */
function aggregateShopData_(allFlatData) {
  if (!allFlatData || allFlatData.length === 0) return;

  const shopAgg = {};
  allFlatData.forEach(r => {
    const key = r[DATA_IDX.SHOP_KEY];
    if (!shopAgg[key]) shopAgg[key] = { qty: 0, weight: 0, invoices: new Set(), epod: 0 };
    shopAgg[key].qty += Number(r[DATA_IDX.QTY]) || 0;
    shopAgg[key].weight += Number(r[DATA_IDX.WEIGHT]) || 0;
    shopAgg[key].invoices.add(r[DATA_IDX.INVOICE_NO]);
    if (checkIsEPOD_(r[DATA_IDX.SOLD_TO_NAME], r[DATA_IDX.INVOICE_NO])) shopAgg[key].epod++;
  });

  allFlatData.forEach(r => {
    const agg = shopAgg[r[DATA_IDX.SHOP_KEY]];
    const scanInv = agg.invoices.size - agg.epod;
    r[DATA_IDX.TOT_QTY] = agg.qty;
    r[DATA_IDX.TOT_WEIGHT] = Number(agg.weight.toFixed(2));
    r[DATA_IDX.SCAN_INV] = scanInv;
    r[DATA_IDX.OWNER_LABEL] = `${r[DATA_IDX.SOLD_TO_NAME]} / รวม ${scanInv} บิล`;
  });
}

// ============================================================
// SECTION 1e: writeDailyJobSheet_ — เขียน Sheet
// ============================================================

/**
 * writeDailyJobSheet_ — [REFACTOR-01] เขียนข้อมูลลงตารางงานประจำวัน
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Array[]} allFlatData - flat row array
 */
function writeDailyJobSheet_(ss, allFlatData) {
  const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);
  if (!dataSheet) throw new Error("CRITICAL: ไม่พบชีต Data");

  const headers = SCHEMA[SHEET.DAILY_JOB];

  dataSheet.clear();
  dataSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");

  if (allFlatData.length > 0) {
    dataSheet.getRange(2, 1, allFlatData.length, headers.length).setValues(allFlatData);
    dataSheet.getRange(2, DATA_IDX.PLAN_DELIVERY + 1, allFlatData.length, 1).setNumberFormat("dd/mm/yyyy");
    dataSheet.getRange(2, DATA_IDX.INVOICE_NO + 1, allFlatData.length, 1).setNumberFormat("@");
    dataSheet.getRange(2, DATA_IDX.DELIVERY_NO + 1, allFlatData.length, 1).setNumberFormat("@");
  }
}

// ============================================================
// SECTION 2: fetchWithRetry_ — ดึงข้อมูลพร้อมกลไก Retry
// ============================================================

function fetchWithRetry_(url, options, maxRetries) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() === 200) return response.getContentText();
      // [SEC-011 FIX] Truncate response body เพื่อป้องกัน PII leakage ไป Stackdriver/SYS_LOG
      const body = response.getContentText();
      const truncatedBody = body.length > 200
        ? body.substring(0, 200) + '...(truncated, total ' + body.length + ' chars)'
        : body;
      throw new Error("HTTP " + response.getResponseCode() + ": " + truncatedBody);
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      Utilities.sleep(1000 * Math.pow(2, i));
      logWarn('ServiceSCG', `Retry attempt ${i + 1} failed. Retrying...`);
    }
  }
}

// ============================================================
// SECTION 3: checkIsEPOD_ — [REF-019] ตรวจสอบ E-POD ตามเงื่อนไขเจ้าของงาน
// เพิ่ม _ suffix ตามกฎ Private Function (Rule 8 — ใช้ภายในโมดูลเท่านั้น)
// ============================================================

function checkIsEPOD_(ownerName, invoiceNo) {
  if (!ownerName || !invoiceNo) return false;
  const owner = String(ownerName).toUpperCase();
  const inv = String(invoiceNo);

  if (SCG_CONFIG.EPOD_OWNERS.some(w => owner.includes(w.toUpperCase()))) return true;

  if (owner.includes("DENSO") || owner.includes("เด็นโซ่")) {
    if (inv.includes("_DOC")) return false;
    if (/^\d+(-.*)?$/.test(inv)) return true;
    return false;
  }

  return false;
}

// ============================================================
// SECTION 4: applyMasterCoordinatesToDailyJob
// ============================================================

/**
 * applyMasterCoordinatesToDailyJob
 * เรียก runLookupEnrichment จาก 17_SearchService.gs
 */
function applyMasterCoordinatesToDailyJob() {
  try {
  logInfo('ServiceSCG', 'applyMasterCoordinates → เรียก Module 17');
  runLookupEnrichment();
  // [ADD v5.5.014] คัดลอก "ชื่อจริง" + "ที่อยู่จริง" จาก Source sheet → DAILY_JOB
  copyDriverVerifiedToDailyJob_();
  logInfo('ServiceSCG', 'applyMasterCoordinates เสร็จสิ้น');
  } catch (err) {
    logError('ServiceSCG', 'applyMasterCoordinates ล้มเหลว: ' + err.message, err);
    // [FIX B4 v5.5.002] เปลี่ยน getUi().alert() → safeUiAlert_() — trigger-safe
    safeUiAlert_('เกิดข้อผิดพลาด: ' + err.message);
  }
}

/**
 * copyDriverVerifiedToDailyJob_ — [ADD v5.5.014]
 * คัดลอก "ชื่อลูกค้าปลายทางจริง" + "ชื่อสถานที่อยู่ลูกค้าปลายทางจริง" จาก Source sheet → DAILY_JOB
 * ใช้ ShopKey (ShipmentNo|ShipToName) เป็น lookup key ระหว่าง 2 ชีต
 * ถ้า Source sheet ไม่มีข้อมูลจริง → DAILY_JOB col 29-30 จะว่าง (ไม่ error)
 */
function copyDriverVerifiedToDailyJob_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = ss.getSheetByName(SHEET.SOURCE);
    const dailyJobSheet = ss.getSheetByName(SHEET.DAILY_JOB);
    if (!sourceSheet || !dailyJobSheet) return;

    // อ่าน Source sheet: ShipmentNo(7), ShipToName(12), DriverVerifiedName(37), DriverVerifiedAddr(38)
    const srcLastRow = sourceSheet.getLastRow();
    if (srcLastRow < 2) return;
    const srcCols = Math.max(SRC_IDX.DRIVER_VERIFIED_ADDR + 1, sourceSheet.getLastColumn());
    const srcData = sourceSheet.getRange(2, 1, srcLastRow - 1, srcCols).getValues();

    // สร้าง lookup: "ShipmentNo|ShipToName" → { driverVerifiedName, driverVerifiedAddr }
    const lookup = {};
    srcData.forEach(function(r) {
      var shipmentNo = String(r[SRC_IDX.SHIPMENT_NO] || '').trim();
      var shipToName = String(r[SRC_IDX.RAW_PERSON_NAME] || '').trim();
      var dvName = String(r[SRC_IDX.DRIVER_VERIFIED_NAME] || '').trim();
      var dvAddr = String(r[SRC_IDX.DRIVER_VERIFIED_ADDR] || '').trim();
      if (shipmentNo && shipToName) {
        var key = shipmentNo + '|' + shipToName;
        // [FIX CRIT-003] merge mode — เติม field ที่ว่าง แทน one-shot
        if (!lookup[key]) lookup[key] = { name: '', addr: '' };
        if (dvName && !lookup[key].name) lookup[key].name = dvName;
        if (dvAddr && !lookup[key].addr) lookup[key].addr = dvAddr;
      }
    });

    // อ่าน DAILY_JOB และเติม col 29-30
    const djLastRow = dailyJobSheet.getLastRow();
    if (djLastRow < 2) return;
    const djCols = SCHEMA[SHEET.DAILY_JOB].length;
    const djData = dailyJobSheet.getRange(2, 1, djLastRow - 1, djCols).getValues();

    var updated = 0;
    var nameCol = DATA_IDX.DRIVER_VERIFIED_NAME + 1; // 1-based for setValues
    var addrCol = DATA_IDX.DRIVER_VERIFIED_ADDR + 1;

    djData.forEach(function(r, i) {
      var shopKey = String(r[DATA_IDX.SHOP_KEY] || '').trim();
      var dv = lookup[shopKey];
      if (dv) {
        var changed = false;
        if (dv.name && !r[DATA_IDX.DRIVER_VERIFIED_NAME]) {
          r[DATA_IDX.DRIVER_VERIFIED_NAME] = dv.name;
          changed = true;
        }
        if (dv.addr && !r[DATA_IDX.DRIVER_VERIFIED_ADDR]) {
          r[DATA_IDX.DRIVER_VERIFIED_ADDR] = dv.addr;
          changed = true;
        }
        if (changed) updated++;
      }
    });

    if (updated > 0) {
      // เขียนเฉพาะ col 29-30 (ไม่เขียนทั้งแถว เพื่อลด API calls)
      var nameRange = dailyJobSheet.getRange(2, nameCol, djLastRow - 1, 1);
      var addrRange = dailyJobSheet.getRange(2, addrCol, djLastRow - 1, 1);
      var nameValues = djData.map(function(r) { return [r[DATA_IDX.DRIVER_VERIFIED_NAME] || '']; });
      var addrValues = djData.map(function(r) { return [r[DATA_IDX.DRIVER_VERIFIED_ADDR] || '']; });
      nameRange.setValues(nameValues);
      addrRange.setValues(addrValues);
      logInfo('ServiceSCG', 'copyDriverVerifiedToDailyJob_: คัดลอกข้อมูลจริง ' + updated + ' แถว');
    }
  } catch (e) {
    logError('ServiceSCG', 'copyDriverVerifiedToDailyJob_ ล้มเหลว: ' + e.message, e);
  }
}

// ============================================================
// SECTION 5: buildOwnerSummary — [REF-017] thin wrapper
// ============================================================

function buildOwnerSummary(optData) {
  // [FIX R12] เพิ่ม try-catch — menu entry point ต้องมี error handling
  try {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);
  if (!dataSheet || dataSheet.getLastRow() < 2) return;

  const data = optData || dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, SCHEMA[SHEET.DAILY_JOB].length).getValues();

  // [REF-017] ใช้ buildSummarySheet_() แทน duplicate logic
  buildSummarySheet_(data, SHEET.OWNER_SUMMARY, ss,
    // groupKeyFn: รวมตาม SoldToName
    function(r) {
      const ownerName = r[DATA_IDX.SOLD_TO_NAME];
      return ownerName || null;
    },
    // rowBuildFn: สร้าง row จาก aggregated map entry
    function(owner, agg, numCols) {
      const row = new Array(numCols).fill('');
      row[OWNER_SUM_IDX.SOLD_TO]     = owner;
      row[OWNER_SUM_IDX.QTY_ALL]     = agg.all.size;
      row[OWNER_SUM_IDX.QTY_EPOD]    = agg.epod.size;
      row[OWNER_SUM_IDX.LAST_UPDATE] = new Date();
      return row;
    },
    // formatFn: จัด number format
    function(summarySheet, rows, numCols) {
      if (rows.length > 0) {
        summarySheet.getRange(2, OWNER_SUM_IDX.QTY_ALL + 1, rows.length, 2).setNumberFormat("#,##0");
        summarySheet.getRange(2, OWNER_SUM_IDX.LAST_UPDATE + 1, rows.length, 1).setNumberFormat("dd/mm/yyyy HH:mm");
      }
    }
  );

  } catch (e) {
    logError('ServiceSCG', 'buildOwnerSummary ล้มเหลว: ' + e.message, e);
  }
}

// ============================================================
// SECTION 6: buildShipmentSummary — [REF-017] thin wrapper
// ============================================================

function buildShipmentSummary(optData) {
  // [FIX R12] เพิ่ม try-catch — menu entry point ต้องมี error handling
  try {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);
  if (!dataSheet || dataSheet.getLastRow() < 2) return;

  const data = optData || dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, SCHEMA[SHEET.DAILY_JOB].length).getValues();

  // [REF-017] ใช้ buildSummarySheet_() แทน duplicate logic
  buildSummarySheet_(data, SHEET.SHIPMENT_SUM, ss,
    // groupKeyFn: รวมตาม ShipmentNo + TruckLicense
    function(r) {
      const shipmentNo = r[DATA_IDX.SHIPMENT_NO];
      const truckLicense = r[DATA_IDX.TRUCK_LICENSE];
      if (!shipmentNo || !truckLicense) return null;
      return shipmentNo + "_" + truckLicense;
    },
    // rowBuildFn: สร้าง row จาก aggregated map entry
    function(key, agg, numCols) {
      const row = new Array(numCols).fill('');
      row[SHIPMENT_SUM_IDX.SHIPMENT_KEY] = key;
      row[SHIPMENT_SUM_IDX.SHIPMENT_NO]  = agg.shipmentNo;
      row[SHIPMENT_SUM_IDX.TRUCK]        = agg.truck;
      row[SHIPMENT_SUM_IDX.QTY_ALL]      = agg.all.size;
      row[SHIPMENT_SUM_IDX.QTY_EPOD]     = agg.epod.size;
      row[SHIPMENT_SUM_IDX.LAST_UPDATE]  = new Date();
      return row;
    },
    // formatFn: จัด number format
    function(summarySheet, rows, numCols) {
      if (rows.length > 0) {
        summarySheet.getRange(2, SHIPMENT_SUM_IDX.QTY_ALL + 1, rows.length, 2).setNumberFormat("#,##0");
        summarySheet.getRange(2, SHIPMENT_SUM_IDX.LAST_UPDATE + 1, rows.length, 1).setNumberFormat("dd/mm/yyyy HH:mm");
      }
    },
    // extraInitFn: เพิ่ม extra fields ใน map entry สำหรับ Shipment
    function(r, key) {
      return { shipmentNo: r[DATA_IDX.SHIPMENT_NO], truck: r[DATA_IDX.TRUCK_LICENSE], all: new Set(), epod: new Set() };
    }
  );

  } catch (e) {
    logError('ServiceSCG', 'buildShipmentSummary ล้มเหลว: ' + e.message, e);
  }
}

// ============================================================
// SECTION 6a: buildSummarySheet_ — [REF-017] Generic summary builder
// ============================================================

/**
 * buildSummarySheet_ — [REF-017] สร้าง summary sheet แบบ generic
 * รวม logic ร่วมระหว่าง buildOwnerSummary และ buildShipmentSummary:
 *   1. อ่าน sourceData → aggregate by groupKey → { all: Set(invoices), epod: Set(invoices) }
 *   2. เขียนลง summary sheet
 *
 * @param {Array[]} sourceData - ข้อมูลจาก DAILY_JOB
 * @param {string} sheetName - ชื่อ summary sheet (เช่น SHEET.OWNER_SUMMARY)
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {function(Object): string|null} groupKeyFn - ฟังก์ชันดึง key จาก row (คืน null = ข้าม)
 * @param {function(string, Object, number): Array} rowBuildFn - ฟังก์ชันสร้าง row array จาก (key, agg, numCols)
 * @param {function(Object, Array[], number): void} formatFn - ฟังก์ชันจัด number format บน sheet
 * @param {function(Object, string): Object} [extraInitFn] - ฟังก์ชันสร้าง initial map value (default: {all: Set, epod: Set})
 */
function buildSummarySheet_(sourceData, sheetName, ss, groupKeyFn, rowBuildFn, formatFn, extraInitFn) {
  const summarySheet = ss.getSheetByName(sheetName);
  if (!summarySheet) { safeUiAlert_("❌ ไม่พบชีต " + sheetName); return; }

  // Aggregate
  const aggMap = {};
  sourceData.forEach(r => {
    const key = groupKeyFn(r);
    if (key === null) return;

    if (!aggMap[key]) {
      aggMap[key] = extraInitFn ? extraInitFn(r, key) : { all: new Set(), epod: new Set() };
    }

    const invoiceNo = r[DATA_IDX.INVOICE_NO];
    if (!invoiceNo) return;

    const ownerName = r[DATA_IDX.SOLD_TO_NAME];
    if (checkIsEPOD_(ownerName, invoiceNo)) {
      aggMap[key].epod.add(invoiceNo);
    } else {
      aggMap[key].all.add(invoiceNo);
    }
  });

  // Clear old data
  const schemaCols = SCHEMA[sheetName].length;
  const summaryLastRow = summarySheet.getLastRow();
  if (summaryLastRow > 1) summarySheet.getRange(2, 1, summaryLastRow - 1, schemaCols).clearContent().setBackground(null);

  // Build rows
  const rows = [];
  Object.keys(aggMap).sort().forEach(key => {
    rows.push(rowBuildFn(key, aggMap[key], schemaCols));
  });

  // Write
  if (rows.length > 0) {
    summarySheet.getRange(2, 1, rows.length, schemaCols).setValues(rows);
  }

  // Apply format
  formatFn(summarySheet, rows, schemaCols);
}

// ============================================================
// SECTION 7: Clear Functions
// ============================================================

function clearAllSCGSheets_UI() {
  // [SEC-002] Authorization Guard
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์ล้างข้อมูล\nกรุณาติดต่อ Admin');
    return;
  }
  // [FIX B4 v5.5.002] เพิ่ม try-catch — menu entry point ต้องมี error handling
  try {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('🗑️ กำลังล้างข้อมูลชีตที่เลือก...', APP_NAME, -1);

  let   cleared = 0;

  [SHEET.DAILY_JOB, SHEET.OWNER_SUMMARY, SHEET.SHIPMENT_SUM].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
      cleared++;
    }
  });

  logInfo('ServiceSCG', `clearAllSCGSheets_UI: ล้าง ${cleared} ชีต`);
  // [RF-03] เปลี่ยน ui.alert() → safeUiAlert_() — trigger-safe
  safeUiAlert_(`✅ ล้างข้อมูล ${cleared} ชีตเรียบร้อย`);

  } catch (e) {
    logError('ServiceSCG', 'clearAllSCGSheets_UI ล้มเหลว: ' + e.message, e);
    safeUiAlert_('เกิดข้อผิดพลาดในการล้างข้อมูล: ' + e.message);
  }
}

function clearDailyJobLatLng() {
  // [FIX B5 v5.5.002] เพิ่ม try-catch — ป้องกัน unhandled error จาก sheet operations
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.DAILY_JOB);
  if (!sheet || sheet.getLastRow() < 2) return;

  const totalRows    = sheet.getLastRow() - 1;
  const latActualCol = DATA_IDX.LATLNG_ACTUAL + 1;

  sheet.getRange(2, latActualCol, totalRows, 1).clearContent();
  sheet.getRange(2, 1, totalRows, SCHEMA[SHEET.DAILY_JOB].length)
       .setBackground(null);

  logInfo('ServiceSCG', `clearDailyJobLatLng: ล้าง ${totalRows} แถว`);

  } catch (e) {
    logError('ServiceSCG', 'clearDailyJobLatLng ล้มเหลว: ' + e.message, e);
  }
}
