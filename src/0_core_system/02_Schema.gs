/**
 * VERSION: 5.5.020
 * FILE: 02_Schema.gs
 * LMDS V5.5 — Sheet Schema Definitions
 * ===================================================
 * PURPOSE:
 *   กำหนด Schema ของทุก Sheet ในระบบ รวมถึง Column Headers และ Validation Rules
 *   เป็น Single Source of Truth สำหรับโครงสร้างข้อมูล
 * ===================================================
 * ===================================================
 * CHANGELOG: See /docs/CHANGELOG.md for full history.
 *   Latest 3 versions:
 *     v5.5.020 (2026-06-22) — REFACTOR_CYCLE6_RESIDUAL (REF-005 cleanup + REF-011 pilot)
 *     v5.5.019 (2026-06-22) — REFACTOR_CYCLE6 (12 issues — REF-001 to REF-012)
 *     v5.5.018 (2026-06-21) — REVIEW15 CLEAN CODE FIX (14 issues)
 * ===================================================
 * DEPENDENCIES:
 *   DEFINES SCHEMA FOR:
 *     - SHEET.M_PERSON        → 06_PersonService.gs
 *     - SHEET.M_PERSON_ALIAS  → 06_PersonService.gs / 10_MatchEngine.gs
 *     - SHEET.M_PLACE         → 07_PlaceService.gs
 *     - SHEET.M_PLACE_ALIAS   → 07_PlaceService.gs / 10_MatchEngine.gs
 *     - SHEET.M_ALIAS         → 21_AliasService.gs / 10_MatchEngine.gs (Single Writer)
 *     - SHEET.M_GEO_POINT     → 08_GeoService.gs
 *     - SHEET.M_DESTINATION   → 09_DestinationService.gs
 *     - SHEET.FACT_DELIVERY   → 11_TransactionService.gs / 10_MatchEngine.gs
 *     - SHEET.Q_REVIEW        → 12_ReviewService.gs
 *     - SHEET.DAILY_JOB       → 18_ServiceSCG.gs / 17_SearchService.gs
 *     - SHEET.MAPS_CACHE      → 15_GoogleMapsAPI.gs
 *     - SHEET.SYS_TH_GEO      → 16_GeoDictionaryBuilder.gs
 *   USED BY (Index References):
 *     - 01_Config.gs         (INDEX constants via validateConfig)
 *     - All Service files     (getValues/setValues)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  02_Schema.gs (Schema Definition Hub)                      │
 *   │  ├── SCHEMA{} — Array of column names per sheet            │
 *   │  │   ├── Group 1: Master Data (M_PERSON, M_ALIAS, ...)    │
 *   │  │   ├── Group 1: Fact Table (FACT_DELIVERY)               │
 *   │  │   ├── Group 2: Daily Ops (ตารางงานประจำวัน)            │
 *   │  │   └── System: SYS_LOG, SYS_CONFIG, SYS_TH_GEO          │
 *   │  ├── getSheetHeaders() — Get headers for a sheet           │
 *   │  ├── validateSheetHeaders() — Verify headers match schema  │
 *   │  ├── getColIndex() — Find column index by name             │
 *   │  └── validateSchemaConsistency() — SCHEMA.length vs IDX    │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

const SCHEMA = Object.freeze({

  // ============================================================
  // กลุ่ม 1: Master Data
  // ============================================================

  'M_PERSON': [
    'person_id',        // [0]
    'canonical_name',   // [1]
    'normalized_name',  // [2]
    'phone',            // [3]
    'first_seen',       // [4]
    'last_seen',        // [5]
    'usage_count',      // [6]
    'record_status',    // [7]
    'note',             // [8]
    'master_uuid',      // [9]
  ],

  'M_PERSON_ALIAS': [
    'alias_id',     // [0]
    'person_id',    // [1]
    'alias_name',   // [2]
    'match_score',  // [3]
    'created_at',   // [4]
    'active_flag',  // [5]
  ],

  'M_PLACE': [
    'place_id',        // [0]
    'canonical_name',  // [1]
    'normalized_name', // [2]
    'place_type',      // [3]
    'sub_district',    // [4]
    'district',        // [5]
    'province',        // [6]
    'postcode',        // [7]
    'first_seen',      // [8]
    'last_seen',       // [9]
    'usage_count',     // [10]
    'record_status',   // [11]
    'note',            // [12]
    'master_uuid',     // [13]
  ],

  'M_PLACE_ALIAS': [
    'alias_id',     // [0]
    'place_id',     // [1]
    'alias_name',   // [2]
    'match_score',  // [3]
    'created_at',   // [4]
    'active_flag',  // [5]
  ],

  'M_ALIAS': [
    'alias_id',
    'master_uuid',
    'variant_name',
    'entity_type',
    'confidence',
    'source',
    'created_at',
    'active_flag',
  ],

  'M_GEO_POINT': [
    'geo_id',           // [0]
    'lat',              // [1]
    'lng',              // [2]
    'radius_m',         // [3]
    'resolved_address', // [4]
    'province',         // [5]
    'district',         // [6]
    'source',           // [7]
    'coord_confidence', // [8]
    'first_seen',       // [9]
    'last_seen',        // [10]
    'usage_count',      // [11]
    'record_status',    // [12]
    'extraction_method',// [13] [NEW v5.2.008] (google|place_fallback|text_fallback)
  ],

  'M_DESTINATION': [
    'dest_id',       // [0]
    'person_id',     // [1]
    'place_id',      // [2]
    'geo_id',        // [3]
    'lat',           // [4]
    'lng',           // [5]
    'route_label',   // [6]
    'delivery_date', // [7]
    'usage_count',   // [8]
    'last_seen',     // [9]
    'record_status', // [10]
  ],

  // ============================================================
  // กลุ่ม 1: Fact Table
  // ============================================================

  'FACT_DELIVERY': [
    'tx_id',             // [0]
    'source_sheet',      // [1]
    'source_row_number', // [2]
    'source_record_id',  // [3]
    'delivery_date',     // [4] ✅
    'delivery_time',     // [5]
    'invoice_no',        // [6]
    'shipment_no',       // [7]
    'driver_name',       // [8]
    'truck_license',     // [9]
    'sold_to_code',      // [10]
    'sold_to_name',      // [11]
    'ship_to_name',      // [12]
    'ship_to_address',   // [13]
    'geo_resolved_addr', // [14]
    'person_id',         // [15]
    'place_id',          // [16]
    'geo_id',            // [17] ✅
    'dest_id',           // [18] Fix: เดิม destination_id
    'warehouse',         // [19]
    'raw_lat',           // [20]
    'raw_lng',           // [21]
    'match_status',      // [22]
    'match_confidence',  // [23]
    'match_reason',      // [24]
    'match_action',      // [25]
    'resolved_lat',      // [26]
    'resolved_lng',      // [27]
    'created_at',        // [28]
    'updated_at',        // [29]
    'record_status',     // [30]
    'match_evidence',    // [31] [NEW v5.2.008] สัญญาณที่ใช้แมตช์ (name|phone|geo)
    // [ADD v5.5.014] ชื่อจริงที่คนขับ/ผู้ดูแลยืนยัน — เก็บจาก Source sheet
    'driver_verified_name', // [32] FACT_IDX.DRIVER_VERIFIED_NAME
    'driver_verified_addr', // [33] FACT_IDX.DRIVER_VERIFIED_ADDR
  ],

  // ============================================================
  // กลุ่ม 1: Review Queue
  // ============================================================

  'Q_REVIEW': [
    'review_id',                 // [0]
    'issue_type',                // [1]
    'priority',                  // [2]
    'source_record_id',          // [3]
    'source_row_number',         // [4]
    'invoice_no',                // [5]
    'raw_person_name',           // [6]
    'raw_place_name',            // [7]
    'raw_system_address',        // [8]
    'raw_lat',                   // [9]  ✅ ขยับขึ้นมาหลังลบ raw_geo_resolved_address
    'raw_lng',                   // [10]
    'candidate_person_ids',      // [11]
    'candidate_place_ids',       // [12]
    'candidate_geo_ids',         // [13]
    'candidate_destination_ids', // [14]
    'match_score',               // [15]
    'recommended_action',        // [16]
    'status',                    // [17]
    'reviewer',                  // [18]
    'reviewed_at',               // [19]
    'decision',                  // [20]
    'note',                      // [21]
  ],

  // ============================================================
  // กลุ่ม 1: System Support
  // ============================================================

  'SYS_LOG': [
    'log_id',    // [0]
    'timestamp', // [1]
    'module',    // [2]
    'level',     // [3]
    'message',   // [4]
    'details',   // [5]
  ],

  'SYS_CONFIG': [
    'config_key',   // [0]
    'config_value', // [1]
    'description',  // [2]
    'updated_at',   // [3]
  ],

  /**
   * SYS_TH_GEO — 5 คอลัมน์
   * [FIX v003] ลำดับถูกต้องตามชีตจริง
   * ชีตจริง: รหัสไปรษณีย์[0], แขวง/ตำบล[1], เขต/อำเภอ[2], จังหวัด[3], หมายเหตุ[4]
   * เดิมผิด: sub_district[0], district[1], province[2], postcode[3], region[4]
   */
  'SYS_TH_GEO': [
    'รหัสไปรษณีย์',      // [0] POSTCODE
    'แขวง/ตำบล',         // [1] SUB_DISTRICT
    'เขต/อำเภอ',         // [2] DISTRICT
    'จังหวัด',           // [3] PROVINCE
    'หมายเหตุ',          // [4] NOTE (Reference)
    'ตำบล_clean',       // [5] SUB_DISTRICT_CLEAN
    'อำเภอ_clean',       // [6] DISTRICT_CLEAN
    'ตำบล_label',       // [7] SUB_DISTRICT_LABEL
    'อำเภอ_label',       // [8] DISTRICT_LABEL
    'tambon_norm',      // [9] TAMBON_NORM
    'amphoe_norm',      // [10] AMPHOE_NORM
    'province_norm',    // [11] PROVINCE_NORM
    'search_key',       // [12] SEARCH_KEY (tambon|amphoe|province)
    'postal_key',       // [13] POSTAL_KEY (postal|tambon)
    'note_type',        // [14] NOTE_TYPE
    'note_scope',       // [15] NOTE_SCOPE
  ],

  'RPT_DATA_QUALITY': [
    'report_date',   // [0]
    'total_records', // [1]
    'auto_matched',  // [2]
    'reviewed',      // [3]
    'created_new',   // [4]
    'failed',        // [5]
    'match_rate',    // [6]
    'notes',         // [7]
  ],

  // [REMOVE v5.5.013] MAPS_CACHE SCHEMA ถูกลบออก — MAPS_CACHE sheet ไม่ได้ใช้แล้ว
  //   สูตร Google Maps ใช้ CacheService.getDocumentCache แทน (ดู 15_GoogleMapsAPI.gs)

  // ============================================================
  // กลุ่ม 2: Daily Ops
  // ============================================================

  'ตารางงานประจำวัน': [
    'ID_งานประจำวัน',                         // [0]
    'PlanDelivery',                            // [1]
    'InvoiceNo',                               // [2]
    'ShipmentNo',                              // [3]
    'DriverName',                              // [4]
    'TruckLicense',                            // [5]
    'CarrierCode',                             // [6]
    'CarrierName',                             // [7]
    'SoldToCode',                              // [8]
    'SoldToName',                              // [9]
    'ShipToName',                              // [10]
    'ShipToAddress',                           // [11]
    'LatLong_SCG',                             // [12]
    'MaterialName',                            // [13]
    'ItemQuantity',                            // [14]
    'QuantityUnit',                            // [15]
    'ItemWeight',                              // [16]
    'DeliveryNo',                              // [17]
    'จำนวนปลายทาง_System',                    // [18]
    'รายชื่อปลายทาง_System',                  // [19]
    'ScanStatus',                              // [20]
    'DeliveryStatus',                          // [21]
    'Email พนักงาน',                           // [22]
    'จำนวนสินค้ารวมของร้านนี้',               // [23]
    'น้ำหนักสินค้ารวมของร้านนี้',            // [24]
    'จำนวน_Invoice_ที่ต้องสแกน',             // [25]
    'LatLong_Actual',                          // [26]
    'ชื่อเจ้าของสินค้า_Invoice_ที่ต้องสแกน', // [27]
    'ShopKey',                                 // [28]
    // [ADD v5.5.014] ชื่อจริง — ระบบคัดลอกจาก Source sheet ตอน applyMasterCoordinatesToDailyJob
    'ชื่อลูกค้าปลายทางจริง',            // [29] DATA_IDX.DRIVER_VERIFIED_NAME
    'ชื่อสถานที่อยู่ลูกค้าปลายทางจริง', // [30] DATA_IDX.DRIVER_VERIFIED_ADDR
  ],

  'Input': [
    'COOKIE',      // [0] เซลล์ A1
    'ShipmentNos', // [1] เซลล์ A3
  ],

  /**
   * ข้อมูลพนักงาน — 8 คอลัมน์
   * [FIX v003] ตามชีตจริง (เดิม 5 คอลัมน์ผิด)
   */
  'ข้อมูลพนักงาน': [
    'ID_พนักงาน',              // [0] EMPLOYEE_IDX.EMP_ID
    'ชื่อ - นามสกุล',          // [1] EMPLOYEE_IDX.FULL_NAME
    'เบอร์โทรศัพท์',           // [2] EMPLOYEE_IDX.PHONE
    'เลขที่บัตรประชาชน',       // [3] EMPLOYEE_IDX.NATIONAL_ID
    'ทะเบียนรถ',               // [4] EMPLOYEE_IDX.TRUCK_LIC
    'เลือกประเภทรถยนต์',       // [5] EMPLOYEE_IDX.TRUCK_TYPE
    'Email พนักงาน',            // [6] EMPLOYEE_IDX.EMAIL
    'ROLE',                     // [7] EMPLOYEE_IDX.ROLE
  ],

  /**
   * สรุป_เจ้าของสินค้า — 6 คอลัมน์
   * [FIX v003] ชื่อคอลัมน์ถูกต้องตามชีตจริง
   */
  'สรุป_เจ้าของสินค้า': [
    'SummaryKey',             // [0] Fix: เดิม ลำดับ
    'SoldToName',             // [1] Fix: เดิม เจ้าของสินค้า
    'PlanDelivery',           // [2] Fix: เดิม หมายเหตุ
    'จำนวน_ทั้งหมด',         // [3] Fix: เดิม จำนวน Invoice
    'จำนวน_E-POD_ทั้งหมด',   // [4] Fix: เดิม จำนวน E-POD
    'LastUpdated',            // [5] Fix: เดิม วันที่อัปเดต
  ],

  /**
   * สรุป_Shipment — 7 คอลัมน์
   * [FIX v003] ชื่อคอลัมน์ถูกต้องตามชีตจริง
   */
  'สรุป_Shipment': [
    'ShipmentKey',            // [0] Fix: เดิม key
    'ShipmentNo',             // [1] ✅
    'TruckLicense',           // [2] ✅
    'PlanDelivery',           // [3] Fix: เดิม หมายเหตุ
    'จำนวน_ทั้งหมด',         // [4] Fix: เดิม จำนวน Invoice
    'จำนวน_E-POD_ทั้งหมด',   // [5] Fix: เดิม จำนวน E-POD
    'LastUpdated',            // [6] Fix: เดิม วันที่อัปเดต
  ],

  /**
   * SCGนครหลวงJWDภูมิภาค — 39 คอลัมน์ (ข้อมูลดิบจากคนขับ)
   * [ADD v5.5.011] เพิ่ม SCHEMA สำหรับ SHEET.SOURCE ที่ขาดหายไป
   *   ก่อนหน้านี้มีเพียง SRC_IDX ใน 01_Config.gs แต่ไม่มีใน SCHEMA
   *   ทำให้ getSheetHeaders(SHEET.SOURCE) และ validateSchemaConsistency ไม่ทำงานสำหรับชีตนี้
   *   ตอนนี้ SCHEMA เป็น Single Source of Truth จริงๆ สำหรับทุกชีต
   *   ลำดับและชื่อคอลัมน์ตรงกับ SRC_IDX ใน 01_Config.gs 100%
   */
  'SCGนครหลวงJWDภูมิภาค': [
    'head',                            // [0]  SRC_IDX.ROW_ID          ลำดับ
    'ID_SCGนครหลวงJWDภูมิภาค',        // [1]  SRC_IDX.SOURCE_ID
    'วันที่ส่งสินค้า',                  // [2]  SRC_IDX.DELIVERY_DATE
    'เวลาที่ส่งสินค้า',                 // [3]  SRC_IDX.DELIVERY_TIME
    'จุดส่งสินค้าปลายทาง',              // [4]  SRC_IDX.LATLNG_COMBINED  lat,lng รวมจริง 100%
    'ชื่อ - นามสกุล',                   // [5]  SRC_IDX.DRIVER_NAME     (คนขับ)
    'ทะเบียนรถ',                       // [6]  SRC_IDX.TRUCK_LICENSE
    'Shipment No',                     // [7]  SRC_IDX.SHIPMENT_NO
    'Invoice No',                      // [8]  SRC_IDX.INVOICE_NO
    'รูปถ่ายบิลส่งสินค้า',              // [9]  SRC_IDX.BILL_PHOTO
    'รหัสลูกค้า',                       // [10] SRC_IDX.CUSTOMER_CODE
    'ชื่อเจ้าของสินค้า',               // [11] SRC_IDX.SOLD_TO_NAME   (บริษัทผู้ขาย)
    'ชื่อปลายทาง',                     // [12] SRC_IDX.RAW_PERSON_NAME ← rawPersonName (สกปรก)
    'Email พนักงาน',                   // [13] SRC_IDX.EMPLOYEE_EMAIL
    'LAT',                             // [14] SRC_IDX.LAT             ← lat จริง 100%
    'LONG',                            // [15] SRC_IDX.LNG             ← lng จริง 100%
    'ID_Doc_Return',                   // [16] SRC_IDX.DOC_RETURN_ID
    'คลังสินค้า',                       // [17] SRC_IDX.WAREHOUSE
    'ที่อยู่ปลายทาง',                   // [18] SRC_IDX.RAW_ADDRESS     ← rawAddress (สกปรก)
    'รูปสินค้าตอนส่ง',                  // [19] SRC_IDX.PHOTO_PRODUCT
    'รูปหน้าร้าน/บ้าน',                 // [20] SRC_IDX.PHOTO_STORE
    'หมายเหตุ',                        // [21] SRC_IDX.REMARK
    'เดือน',                           // [22] SRC_IDX.MONTH
    'ระยะทางจากคลัง_Km',               // [23] SRC_IDX.DIST_FROM_WH
    'ชื่อที่อยู่จาก_LatLong',           // [24] SRC_IDX.RESOLVED_ADDR   ← rawPlaceName (สะอาดจาก GoogleMap)
    'SM_Link_SCG',                     // [25] SRC_IDX.SM_LINK
    'ID_พนักงาน',                      // [26] SRC_IDX.EMPLOYEE_ID
    'พิกัดตอนกดบันทึกงาน',             // [27] SRC_IDX.GPS_ON_SUBMIT
    'เวลาเริ่มกรอกงาน',                // [28] SRC_IDX.TIME_START
    'เวลาบันทึกงานสำเร็จ',             // [29] SRC_IDX.TIME_DONE
    'ระยะขยับจากจุดเริ่มต้น_เมตร',      // [30] SRC_IDX.MOVE_DIST_M
    'ระยะเวลาใช้งาน_นาที',             // [31] SRC_IDX.WORK_MIN
    'ความเร็วการเคลื่อนที่_เมตร_นาที',  // [32] SRC_IDX.SPEED_MPM
    'ผลการตรวจสอบงานส่ง',             // [33] SRC_IDX.QC_RESULT
    'เหตุผิดปกติที่ตรวจพบ',            // [34] SRC_IDX.QC_ISSUE
    'เวลาถ่ายรูปหน้าร้าน_หน้าบ้าน',    // [35] SRC_IDX.PHOTO_TIME
    'SYNC_STATUS',                     // [36] SRC_IDX.SYNC_STATUS     ← เช็คก่อน process
    // [ADD v5.5.014] ชื่อจริงที่คนขับ/ผู้ดูแลยืนยัน — กรอกใน AppSheet หรือ Google Sheet
    'ชื่อลูกค้าปลายทางจริง',            // [37] SRC_IDX.DRIVER_VERIFIED_NAME
    'ชื่อสถานที่อยู่ลูกค้าปลายทางจริง', // [38] SRC_IDX.DRIVER_VERIFIED_ADDR
  ],

});

// ============================================================
// Schema Utility Functions
// ============================================================

/**
 * getSheetHeaders — คืน Header Array ของชีตที่ระบุ
 * @param {string} sheetName - ชื่อชีตจริง (ค่าจาก SHEET.xxx)
 */
function getSheetHeaders(sheetName) {
  const headers = SCHEMA[sheetName];
  if (!headers) {
    throw new Error(
      `[Schema] ไม่พบ Schema สำหรับชีต: "${sheetName}"\n` +
      `Schema ที่มี: ${Object.keys(SCHEMA).join(', ')}`
    );
  }
  return headers;
}

/**
 * validateSheetHeaders — ตรวจสอบ Header ของชีตกับ Schema
 * [FIX v002] เพิ่ม wrongOrder + normalize case
 * [FIX v003] ยืนยันใช้งานได้
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} expected
 * @return {{ isValid, missing, extra, wrongOrder }}
 */
function validateSheetHeaders(sheet, expected) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    return { isValid: false, missing: expected, extra: [], wrongOrder: false };
  }

  const normalize   = s => String(s).trim().toLowerCase();
  const actual      = sheet.getRange(1, 1, 1, lastCol)
                           .getValues()[0]
                           .map(h => String(h).trim());
  const actualNorm  = actual.map(normalize);
  const expectNorm  = expected.map(normalize);

  const missing = expected.filter(h => !actualNorm.includes(normalize(h)));
  const extra   = actual.filter(h => h !== '' && !expectNorm.includes(normalize(h)));

  // ตรวจลำดับ
  let wrongOrder = false;
  if (missing.length === 0) {
    wrongOrder = expectNorm.some((h, i) => actualNorm[i] !== h);
  }

  return {
    isValid:    missing.length === 0 && !wrongOrder,
    missing:    missing,
    extra:      extra,
    wrongOrder: wrongOrder,
  };
}

/**
 * getColIndex — [REF-012] DEPRECATED — Use *_IDX.* constants directly (Rule 3: No Hardcode Index)
 *
 *   ฟังก์ชันนี้ยังเก็บไว้เพื่อ backward compatibility แต่ไม่ควรใช้ในโค้ดใหม่
 *   ใช้ PERSON_IDX.*, PLACE_IDX.*, FACT_IDX.*, REVIEW_IDX.*, etc. จาก 01_Config.gs แทน
 *   เหตุผล: runtime O(N) indexOf lookup + ขัด Single Source of Truth rule
 *
 *   Audit พบว่าไม่มี caller จริงใน codebase ปัจจุบัน (เฉพาะ definition + comment)
 *   แต่เก็บไว้เพื่อป้องกัน breaking change ถ้ามี external script เรียกใช้
 *
 * @param {string} schemaKey - ชื่อชีตจริง (key ใน SCHEMA object)
 * @param {string} colName - ชื่อคอลัมน์ที่ต้องการหา index
 * @return {number} 0-based column index หรือ -1 ถ้าไม่พบ
 *
 * @deprecated since V5.5.019 — Use *_IDX.* constants from 01_Config.gs
 */
function getColIndex(schemaKey, colName) {
  // [REF-012] Log warning เมื่อถูกเรียก — ป้องกันการใช้งานในอนาคต
  if (typeof logWarn === 'function') {
    try {
      var stack = (new Error().stack || '').split('\n');
      var caller = stack[2] || 'unknown';
      logWarn('Schema', '[DEPRECATED] getColIndex("' + schemaKey + '", "' + colName + '") — Use *_IDX.* constants instead. Caller: ' + caller.trim());
    } catch (e) { /* ignore log error */ }
  }
  const headers = SCHEMA[schemaKey];
  if (!headers) return -1;
  return headers.indexOf(colName);
}

/**
 * validateSchemaConsistency — ตรวจ SCHEMA.length vs IDX.keys
 * เรียกจาก validateConfig() ใน 01_Config.gs
 */
function validateSchemaConsistency() {
  const checks = [
    { sheetName: SHEET.M_PERSON,       idx: PERSON_IDX,       label: 'M_PERSON'       },
    { sheetName: SHEET.M_PERSON_ALIAS, idx: PERSON_ALIAS_IDX, label: 'M_PERSON_ALIAS' },
    { sheetName: SHEET.M_PLACE,        idx: PLACE_IDX,        label: 'M_PLACE'        },
    { sheetName: SHEET.M_PLACE_ALIAS,  idx: PLACE_ALIAS_IDX,  label: 'M_PLACE_ALIAS'  },
    { sheetName: SHEET.M_GEO_POINT,    idx: GEO_IDX,          label: 'M_GEO_POINT'    },
    { sheetName: SHEET.M_DESTINATION,  idx: DEST_IDX,         label: 'M_DESTINATION'  },
    { sheetName: SHEET.FACT_DELIVERY,  idx: FACT_IDX,         label: 'FACT_DELIVERY'  },
    { sheetName: SHEET.Q_REVIEW,       idx: REVIEW_IDX,       label: 'Q_REVIEW'       },
    { sheetName: SHEET.M_ALIAS,        idx: ALIAS_IDX,        label: 'M_ALIAS'        },
    // [ADD v5.5.011] เพิ่มการตรวจ SCHEMA vs SRC_IDX สำหรับ SHEET.SOURCE
    //   ก่อนหน้านี้ SHEET.SOURCE ไม่มีใน SCHEMA → ไม่ถูกตรวจ → ไม่พบจุดผิดจนกว่าจะ runtime error
    { sheetName: SHEET.SOURCE,         idx: SRC_IDX,          label: 'SCGนครหลวงJWDภูมิภาค (SOURCE)' },
    // [ADD v5.5.011] เพิ่มการตรวจ SCHEMA vs DATA_IDX สำหรับ SHEET.DAILY_JOB
    { sheetName: SHEET.DAILY_JOB,      idx: DATA_IDX,         label: 'ตารางงานประจำวัน (DAILY_JOB)' },
  ];

  const errors = [];
  checks.forEach(item => {
    const schemaArr = SCHEMA[item.sheetName];
    if (!schemaArr) {
      errors.push(`ไม่พบ SCHEMA key: "${item.sheetName}"`);
      return;
    }
    const idxLen = Object.keys(item.idx).length;
    if (schemaArr.length !== idxLen) {
      errors.push(
        `${item.label}: SCHEMA=${schemaArr.length} cols แต่ IDX=${idxLen} keys`
      );
    }
  });

  if (errors.length > 0) {
    throw new Error(
      `Schema Consistency Error (v${SCHEMA_VERSION}):\n` +
      errors.join('\n')
    );
  }

  logInfo('Schema', `validateSchemaConsistency ผ่าน — v${SCHEMA_VERSION}`);
  return true;
}
