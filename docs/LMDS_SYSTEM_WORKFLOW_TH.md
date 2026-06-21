# LMDS System Workflow อธิบายการทำงานระบบ

ไฟล์นี้อธิบายระบบ LMDS จากโค้ดจริงในโปรเจกต์ ณ วันที่ 2026-06-21 (V5.5.020 REFACTOR_CYCLE6_RESIDUAL, 17 audit cycles complete) โดยเน้นว่าแต่ละชีตทำงานร่วมกันอย่างไร คอลัมน์ใดเป็นจุดเชื่อม และกฎธุรกิจล่าสุดของ Group 2 ที่ต้องใช้ `ShipToName` เท่านั้นในการค้นหาพิกัด

> **[V5.5.011] การเปลี่ยนแปลงล่าสุด:**
> - **Sheet2 (ตารางงานประจำวัน) Cleaning:** ตอนนี้ `SHIP_TO_NAME` จาก Sheet2 จะผ่าน `normalizePersonNameFull` ก่อนค้นหา (เหมือน Sheet1) ทำให้จับคู่กับ Master ได้แม่นยำขึ้น
> - **Q_REVIEW Navigation:** คลิกที่คอลัมน์ `recommended_action` (P) ได้แล้ว ระบบจะ parse ID และนำทางไปยัง Master/FACT สำหรับยืนยัน
> - **SCHEMA ครบทุกชีต:** ตอนนี้ `SCHEMA` object ครอบคลุม `SCGนครหลวงJWDภูมิภาค` และ `ตารางงานประจำวัน` แล้ว

## 1. ภาพรวมระบบ

LMDS แบ่งงานออกเป็น 2 ส่วนหลัก

1. Group 1: Actual Delivery / Master Learning
   - แหล่งข้อมูลคือชีต `SCGนครหลวงJWDภูมิภาค`
   - เป็นข้อมูลส่งงานจริงจากคนขับผ่าน AppSheet
   - ระบบนำข้อมูลจริงไปสร้าง/ปรับปรุง Master ได้แก่ `M_PERSON`, `M_PLACE`, `M_GEO_POINT`, `M_DESTINATION`
   - ระบบบันทึกธุรกรรมลง `FACT_DELIVERY`
   - ถ้าข้อมูลไม่มั่นใจจะเข้า `Q_REVIEW`
   - Alias อัตโนมัติเขียนผ่านจุดเดียวคือ `autoEnrichAliasesFromFactBatch_()`

2. Group 2: SCG API / Daily Job / Coordinate Fill
   - แหล่งข้อมูลคือชีต `Input` และ SCG API
   - ผลลัพธ์จาก API ถูกเขียนลง `ตารางงานประจำวัน`
   - ระบบค้นหาพิกัดจริงจาก Master แล้วเขียนกลับคอลัมน์ `LatLong_Actual`
   - กฎล่าสุด: ใช้ `ShipToName` เท่านั้นในการค้นหา ห้ามใช้ `ShipToAddress` เป็น anchor เพราะข้อมูลไม่ reliable

หลักสำคัญของระบบคือ Trinity Framework

```text
Person_ID + Place_ID + Geo_ID = Destination Node
```

Destination Node อยู่ในชีต `M_DESTINATION` และเป็นจุดที่ Group 2 ใช้ย้อนกลับมาเอาพิกัดที่เคยเรียนรู้จาก Group 1

## 2. หลักฐานจากโค้ดที่ยืนยันชื่อชีตหลัก

ชื่อชีตหลักถูกกำหนดใน `src/0_core_system/01_Config.gs:102-123`

```javascript
const SHEET = Object.freeze({
  M_PERSON:       'M_PERSON',
  M_PERSON_ALIAS: 'M_PERSON_ALIAS',
  M_PLACE:        'M_PLACE',
  M_PLACE_ALIAS:  'M_PLACE_ALIAS',
  M_ALIAS:        'M_ALIAS',
  M_GEO_POINT:    'M_GEO_POINT',
  M_DESTINATION:  'M_DESTINATION',
  FACT_DELIVERY:  'FACT_DELIVERY',
  Q_REVIEW:       'Q_REVIEW',
  SOURCE:         'SCGนครหลวงJWDภูมิภาค',
  SYS_CONFIG:     'SYS_CONFIG',
  SYS_LOG:        'SYS_LOG',
  SYS_TH_GEO:     'SYS_TH_GEO',
  RPT_QUALITY:    'RPT_DATA_QUALITY',
  DAILY_JOB:      'ตารางงานประจำวัน',
  INPUT:          'Input',
  EMPLOYEE:       'ข้อมูลพนักงาน',
  OWNER_SUMMARY:  'สรุป_เจ้าของสินค้า',
  SHIPMENT_SUM:   'สรุป_Shipment',
});
```

> **[V5.5.013]** `MAPS_CACHE: 'MAPS_CACHE'` ถูกลบออกจาก SHEET object (ใช้ @customFunction formulas ของ Amit Agarwal แทน)

## 3. Group 1: Actual Delivery / Master Learning

### 3.1 ชีตต้นทาง

ชีต: `SCGนครหลวงJWDภูมิภาค`

ข้อมูลนี้เป็นข้อมูลจริงจากการส่งงานของคนขับผ่าน AppSheet จึงเป็นข้อมูลที่ระบบใช้เรียนรู้ Master ได้ เพราะมีชื่อปลายทาง ที่อยู่ และพิกัดจากการทำงานจริง

คอลัมน์สำคัญของชีตนี้อ้างอิงจาก `SRC_IDX` ใน `src/0_core_system/01_Config.gs:352-390`

| ความหมาย | Constant | คอลัมน์ 0-based | ใช้ทำอะไร |
|---|---:|---:|---|
| ID source | `SRC_IDX.SOURCE_ID` | 1 | อ้างอิงกลับแถวต้นทาง |
| วันที่ส่ง | `SRC_IDX.DELIVERY_DATE` | 2 | วิเคราะห์งานตามวัน |
| พิกัดรวม | `SRC_IDX.LATLNG_COMBINED` | 4 | แหล่งพิกัดรวมจากหน้างาน |
| คนขับ | `SRC_IDX.DRIVER_NAME` | 5 | ข้อมูลปฏิบัติการ |
| Shipment | `SRC_IDX.SHIPMENT_NO` | 7 | เชื่อมกับงานขนส่ง |
| Invoice | `SRC_IDX.INVOICE_NO` | 8 | ใช้ dedupe/upsert FACT |
| เจ้าของสินค้า | `SRC_IDX.SOLD_TO_NAME` | 11 | ใช้รายงาน/บริบท |
| ชื่อปลายทางจริง | `SRC_IDX.RAW_PERSON_NAME` | 12 | เข้า `resolvePerson()` |
| Lat | `SRC_IDX.LAT` | 14 | เข้า `resolveGeo()` |
| Lng | `SRC_IDX.LNG` | 15 | เข้า `resolveGeo()` |
| ที่อยู่ดิบ | `SRC_IDX.RAW_ADDRESS` | 18 | เข้า `resolvePlace()`/review |
| ที่อยู่จาก LatLong | `SRC_IDX.RESOLVED_ADDR` | 24 | ช่วยสร้าง Place ที่สะอาดกว่า |
| สถานะ sync | `SRC_IDX.SYNC_STATUS` | 36 | กันประมวลผลซ้ำ |

### 3.2 ขั้นตอนประมวลผล Group 1

โค้ดหลักอยู่ที่ `src/1_group1_master_db/10_MatchEngine.gs`

หลักฐานจาก `processOneRow()` ที่ `src/1_group1_master_db/10_MatchEngine.gs:513-525`

```javascript
function processOneRow(srcObj) {
  const personResult = resolvePerson(srcObj.rawPersonName);

  const placeResult  = resolvePlace(
    srcObj.rawPlaceName || srcObj.rawAddress,
    srcObj.province || ''
  );

  const geoResult    = resolveGeo(srcObj.rawLat, srcObj.rawLng);

  const decision = makeMatchDecision(srcObj, personResult, placeResult, geoResult);
  const result   = executeDecision(srcObj, decision, personResult, placeResult, geoResult);
```

ความหมายคือ Group 1 ใช้ข้อมูลจริงจาก AppSheet เพื่อแยกเป็น 3 แกน

| แกน | ฟังก์ชัน | Master Sheet |
|---|---|---|
| ใคร | `resolvePerson(srcObj.rawPersonName)` | `M_PERSON` |
| สถานที่/ที่อยู่ | `resolvePlace(srcObj.rawPlaceName || srcObj.rawAddress, srcObj.province || '')` | `M_PLACE` |
| พิกัดจริง | `resolveGeo(srcObj.rawLat, srcObj.rawLng)` | `M_GEO_POINT` |

จากนั้นระบบตัดสินใจด้วย `makeMatchDecision()` และบันทึกผลด้วย `executeDecision()`

### 3.3 ตารางที่ Group 1 เขียน

| ปลายทาง | หน้าที่ |
|---|---|
| `M_PERSON` | Master ของชื่อปลายทาง/บุคคล/ร้าน/ลูกค้า |
| `M_PLACE` | Master ของสถานที่/ที่อยู่ |
| `M_GEO_POINT` | Master ของพิกัด GPS |
| `M_DESTINATION` | จุดเชื่อม Person + Place + Geo |
| `FACT_DELIVERY` | ประวัติธุรกรรมการส่งจริง |
| `Q_REVIEW` | คิวให้คนตรวจในเคสไม่มั่นใจ |
| `M_ALIAS`, `M_PERSON_ALIAS`, `M_PLACE_ALIAS` | ชื่อแฝงที่ช่วยจับคู่ครั้งต่อไป |

### 3.4 Single Writer Pattern ของ Alias

Group 1 pipeline เขียน Alias อัตโนมัติผ่านจุดเดียว เพื่อป้องกันข้อมูล alias ซ้ำหรือวน circular dependency

หลักฐานตำแหน่งฟังก์ชัน: `src/1_group1_master_db/10_MatchEngine.gs:238`

```javascript
function autoEnrichAliasesFromFactBatch_(factBatch) {
```

ใน Group 2 มี comment ยืนยันว่าไม่เขียน `M_ALIAS` ตอน fetch API: `src/2_group2_daily_ops/18_ServiceSCG.gs:204-206`

```javascript
// [FIX v5.4.002] ไม่เขียน M_ALIAS อัตโนมัติจาก Group 2 fetch
// เพื่อรักษา Single Writer Pattern ของ pipeline: autoEnrichAliasesFromFactBatch_() เท่านั้น
// หากต้อง migrate alias จาก SCG raw ให้ใช้เมนู admin: "ดึงชื่อจาก SCG ดิบ → M_ALIAS"
```

## 4. Group 2: SCG API / Daily Job / Coordinate Fill

### 4.1 ชีตต้นทางและปลายทาง

| ขั้น | ชีต | หน้าที่ |
|---|---|---|
| 1 | `Input` | ใส่ Cookie และ Shipment No ที่ต้องโหลด |
| 2 | SCG API | แหล่งข้อมูลแผนงานประจำวัน |
| 3 | `ตารางงานประจำวัน` | เก็บงานที่โหลดจาก API และใช้ใน AppSheet |
| 4 | `M_ALIAS`, `M_PERSON`, `M_DESTINATION` | ฐานค้นหาพิกัดจาก Master |
| 5 | `LatLong_Actual` ใน `ตารางงานประจำวัน` | พิกัดที่ระบบเติมให้ใช้งานจริง |
| 6 | `สรุป_เจ้าของสินค้า`, `สรุป_Shipment` | รายงานสรุปงาน |

### 4.2 โครงสร้าง `ตารางงานประจำวัน`

คอลัมน์ถูกกำหนดใน `DATA_IDX` ที่ `src/0_core_system/01_Config.gs:397-427`

```javascript
const DATA_IDX = Object.freeze({
  SOLD_TO_NAME:    9,
  SHIP_TO_NAME:    10,
  SHIP_TO_ADDR:    11,
  LATLNG_SCG:      12,
  LATLNG_ACTUAL:   26,
  OWNER_LABEL:     27,
  SHOP_KEY:        28,
});
```

คอลัมน์ที่ต้องเข้าใจเป็นพิเศษ

| คอลัมน์ | Constant | ใช้จริงหรือไม่ | เหตุผล |
|---|---|---|---|
| `ShipToName` | `DATA_IDX.SHIP_TO_NAME` | ใช้เป็น anchor หลักและ anchor เดียว | เป็นชื่อปลายทางที่ผูกกับ Master/Alias ได้ดีที่สุด |
| `ShipToAddress` | `DATA_IDX.SHIP_TO_ADDR` | ไม่ใช้เป็น matching anchor | ข้อมูลจาก API เชื่อถือไม่ได้ อาจมีแค่อำเภอ |
| `LatLong_SCG` | `DATA_IDX.LATLNG_SCG` | ไม่ใช้เป็น fallback เพื่อเขียน `LatLong_Actual` | ป้องกันพิกัดผิดที่ยังไม่ได้ verified |
| `LatLong_Actual` | `DATA_IDX.LATLNG_ACTUAL` | เป็นผลลัพธ์ที่ระบบเติม | ได้จาก Master ที่เรียนรู้จาก Group 1 |

### 4.3 ขั้นตอนโหลด SCG API

หลักฐานจาก `src/2_group2_daily_ops/18_ServiceSCG.gs:182-202`

```javascript
const headers = [
  "ID_งานประจำวัน", "PlanDelivery", "InvoiceNo", "ShipmentNo", "DriverName",
  "TruckLicense", "CarrierCode", "CarrierName", "SoldToCode", "SoldToName",
  "ShipToName", "ShipToAddress", "LatLong_SCG", "MaterialName", "ItemQuantity",
  "QuantityUnit", "ItemWeight", "DeliveryNo", "จำนวนปลายทาง_System", "รายชื่อปลายทาง_System",
  "ScanStatus", "DeliveryStatus", "Email พนักงาน",
  "จำนวนสินค้ารวมของร้านนี้", "น้ำหนักสินค้ารวมของร้านนี้", "จำนวน_Invoice_ที่ต้องสแกน",
  "LatLong_Actual", "ชื่อเจ้าของสินค้า_Invoice_ที่ต้องสแกน", "ShopKey"
];

dataSheet.clear();
dataSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");

if (allFlatData.length > 0) {
  dataSheet.getRange(2, 1, allFlatData.length, headers.length).setValues(allFlatData);
}

applyMasterCoordinatesToDailyJob();
```

หลังโหลดข้อมูล API เสร็จ ระบบเรียก `applyMasterCoordinatesToDailyJob()` เพื่อเติมพิกัดทันที

### 4.4 กฎล่าสุดของ Group 2: ShipToName-only

โค้ดปัจจุบันบังคับกฎนี้ที่ `src/2_group2_daily_ops/17_SearchService.gs:77-81`

```javascript
// [BUSINESS RULE v5.4.003]
// Group 2 Daily Job lookup must use ShipToName only.
// ShipToAddress from SCG API is unreliable (often district-only), so it must not
// be used as a matching anchor or fallback for LatLong_Actual.
// rawPlace/scgLatLng are kept in the signature for backward compatibility only.
```

ขั้นตอนค้นหาจริงใน `findBestGeoByPersonPlace()` คือ

1. Normalize `ShipToName`
   - หลักฐาน: `src/2_group2_daily_ops/17_SearchService.gs:83-85`
2. ค้นผ่าน `M_ALIAS` ด้วย `fastLookupByShipToName(rawPerson)`
   - หลักฐาน: `src/2_group2_daily_ops/17_SearchService.gs:95-105`
3. ถ้า alias ไม่เจอ ให้หา Person ด้วย `resolvePerson(rawPerson)` แล้วดึง destination ของคนนั้นด้วย `getDestsByPersonId(personId)`
   - หลักฐาน: `src/2_group2_daily_ops/17_SearchService.gs:108-120`
4. ถ้าไม่เจอ ให้ `NOT_FOUND` และไม่ fallback ไปที่ address/API/AI
   - หลักฐาน: `src/2_group2_daily_ops/17_SearchService.gs:125-132`

### 4.5 เส้นทางค้นหาพิกัดแบบย่อ

```text
ตารางงานประจำวัน.ShipToName
  → normalizePersonNameFull()
  → fastLookupByShipToName()
      → M_ALIAS.variant_name
      → M_ALIAS.master_uuid
      → M_PERSON.master_uuid / M_PLACE.master_uuid
      → M_DESTINATION
      → lat,lng
  → ถ้า Alias ไม่เจอ: resolvePerson(ShipToName)
      → M_PERSON.person_id
      → getDestsByPersonId(person_id)
      → M_DESTINATION top usage
      → lat,lng
  → ถ้าไม่เจอ: LatLong_Actual = blank, แถวเป็นสี not found
```

## 5. ความสัมพันธ์ชีตต่อชีต

### 5.1 Actual delivery flow

```text
SCGนครหลวงJWDภูมิภาค
  → 04_SourceRepository.gs สร้าง srcObj
  → 10_MatchEngine.gs
      → resolvePerson() → M_PERSON / M_PERSON_ALIAS / M_ALIAS
      → resolvePlace()  → M_PLACE / M_PLACE_ALIAS / M_ALIAS
      → resolveGeo()    → M_GEO_POINT
      → resolveDestination() → M_DESTINATION
  → 11_TransactionService.gs → FACT_DELIVERY
  → 12_ReviewService.gs      → Q_REVIEW เมื่อไม่มั่นใจ
```

### 5.2 Daily job flow

```text
Input
  → 18_ServiceSCG.gs fetchDataFromSCGJWD()
  → ตารางงานประจำวัน
  → 17_SearchService.gs runLookupEnrichment()
      → ใช้เฉพาะ ShipToName
      → M_ALIAS / M_PERSON / M_DESTINATION
  → เขียน LatLong_Actual
  → buildOwnerSummary()
  → buildShipmentSummary()
```

## 6. ตาราง mapping สำคัญ

### 6.1 จาก AppSheet actual delivery ไป Master/Fact

| Source sheet | Source constant | ปลายทางในระบบ | ใช้โดย |
|---|---|---|---|
| `SCGนครหลวงJWDภูมิภาค` | `SRC_IDX.RAW_PERSON_NAME` | `M_PERSON`, `FACT_DELIVERY.SHIP_TO_NAME` | `resolvePerson()`, `upsertFactDelivery()` |
| `SCGนครหลวงJWDภูมิภาค` | `SRC_IDX.RAW_ADDRESS` / `SRC_IDX.RESOLVED_ADDR` | `M_PLACE`, `FACT_DELIVERY.SHIP_TO_ADDR` | `resolvePlace()`, review |
| `SCGนครหลวงJWDภูมิภาค` | `SRC_IDX.LAT` / `SRC_IDX.LNG` | `M_GEO_POINT`, `M_DESTINATION` | `resolveGeo()`, `resolveDestination()` |
| `SCGนครหลวงJWDภูมิภาค` | `SRC_IDX.INVOICE_NO` | `FACT_DELIVERY` | dedupe/upsert |
| `SCGนครหลวงJWDภูมิภาค` | `SRC_IDX.SYNC_STATUS` | source control | กันประมวลผลซ้ำ |

### 6.2 จาก SCG API daily job ไป LatLong_Actual

| Daily job column | Constant | บทบาทล่าสุด |
|---|---|---|
| `ShipToName` | `DATA_IDX.SHIP_TO_NAME` | Anchor เดียวสำหรับ lookup |
| `ShipToAddress` | `DATA_IDX.SHIP_TO_ADDR` | เก็บไว้แสดง/อ้างอิง แต่ไม่ใช้จับคู่ |
| `LatLong_SCG` | `DATA_IDX.LATLNG_SCG` | เก็บไว้แสดง/อ้างอิง แต่ไม่ใช้ fallback |
| `LatLong_Actual` | `DATA_IDX.LATLNG_ACTUAL` | ผลลัพธ์จาก Master เท่านั้น |

## 7. วิธีใช้งานจริงที่แนะนำ

### 7.1 รอบเรียนรู้ Master จากงานจริง

1. ให้คนขับส่งงานผ่าน AppSheet ลง `SCGนครหลวงJWDภูมิภาค`
2. รัน Match Engine ของ Group 1
3. ตรวจ `Q_REVIEW` สำหรับรายการที่ระบบไม่มั่นใจ
4. เมื่อข้อมูลผ่าน/ถูกยืนยันแล้ว ระบบจะมี Master และ Destination ที่ดีขึ้น
5. Alias จะค่อย ๆ ดีขึ้นจาก Single Writer pipeline

### 7.2 รอบงานประจำวันจาก SCG API

1. ใส่ Cookie และ Shipment No ใน `Input`
2. รัน `fetchDataFromSCGJWD()` จากเมนู Group 2
3. ระบบเขียนข้อมูลลง `ตารางงานประจำวัน`
4. ระบบเรียก `applyMasterCoordinatesToDailyJob()` ต่อทันที
5. `runLookupEnrichment()` จะเติม `LatLong_Actual` โดยใช้ `ShipToName` เท่านั้น
6. แถวที่ไม่พบต้องกลับไปเพิ่มคุณภาพ Master ผ่าน Group 1 หรือสร้าง alias ผ่าน admin/migration ที่ถูกต้อง

## 8. ข้อห้ามสำคัญเพื่อไม่ให้ระบบเพี้ยน

1. ห้ามใช้ `ShipToAddress` จาก SCG API เป็น anchor ใน Group 2
2. ห้ามใช้ `LatLong_SCG` เป็น fallback เพื่อเขียน `LatLong_Actual` ในกฎล่าสุด
3. ห้ามให้ `18_ServiceSCG.gs` เขียน `M_ALIAS` อัตโนมัติ
4. ห้ามเพิ่มจุดเขียน `M_ALIAS` นอก `10_MatchEngine.gs` และ `21_AliasService.gs`
5. ห้ามใช้เลข index ตรง ๆ สำหรับคอลัมน์ข้อมูล ให้ใช้ `DATA_IDX`, `SRC_IDX`, `FACT_IDX`, `REVIEW_IDX`
6. ห้ามเขียนทีละแถวใน loop เมื่อทำงานกับ Google Sheets ปริมาณมาก ให้ใช้ batch write

## 9. Troubleshooting

| อาการ | สาเหตุที่พบบ่อย | วิธีแก้ |
|---|---|---|
| `LatLong_Actual` ว่าง | ยังไม่มี `ShipToName` ใน `M_ALIAS`/`M_PERSON` หรือยังไม่มี destination | ให้คนขับส่งงานจริงก่อน หรือแก้ alias/master ผ่าน path ที่ถูกต้อง |
| พิกัดไม่เปลี่ยนตอนรันซ้ำ | แถวนั้นมี `LatLong_Actual` ที่ valid อยู่แล้ว ระบบ skip เพื่อไม่ทับข้อมูล | ถ้าต้องคำนวณใหม่ ให้ล้าง `LatLong_Actual` เฉพาะแถวที่ต้องการก่อนรัน |
| ชื่อเดียวมีหลายพิกัด | ระบบเลือก destination ที่ usageCount สูงสุด | ตรวจ `M_DESTINATION` และ `Q_REVIEW` เพื่อรวม/แก้ข้อมูล |
| ข้อมูลไม่เข้า Master | Source row อาจถูก mark `SYNC_STATUS` แล้ว หรือเข้า `Q_REVIEW` | ตรวจ `SYNC_STATUS`, `SYS_LOG`, `Q_REVIEW` |
| Alias ไม่เกิดจาก daily job | เป็นพฤติกรรมที่ถูกต้องตาม Single Writer | ให้ alias เกิดจาก Group 1 pipeline หรือ admin/migration path |

## 10. สถานะโค้ดล่าสุดที่เกี่ยวข้องกับ requirement นี้

ไฟล์ที่ปรับให้ตรง business rule ล่าสุดคือ `src/2_group2_daily_ops/17_SearchService.gs`

หลักฐานจากหัวไฟล์ปัจจุบัน `src/2_group2_daily_ops/17_SearchService.gs:6-10`

```javascript
* PURPOSE:
*   สะพานเชื่อม Group 2 (ตารางงานประจำวัน) → Group 1 (Master Data)
*   ใช้ ShipToName เพียงคอลัมน์เดียวเพื่อค้นหาพิกัดจาก Master → เขียน LatLong_Actual
*   ห้ามใช้ ShipToAddress เป็น matching anchor เพราะข้อมูลจาก SCG API เชื่อถือไม่ได้/อาจมีแค่อำเภอ
*   ใช้ M_ALIAS Fast Track (Tier 0) เป็นเส้นทางหลัก — เร็วและแม่นยำ
```

ผลที่คาดหวังหลังการปรับนี้

- Group 2 ไม่ใช้ที่อยู่จาก API ในการจับคู่
- Group 2 ไม่ fallback ไปพิกัด SCG API ที่ยังไม่ verified
- ถ้า `ShipToName` ไม่ match กับ Master ระบบจะแสดง `NOT_FOUND` เพื่อให้แก้ Master/Alias อย่างถูกทาง
- ระบบปลอดภัยกว่าเดิม เพราะไม่เอาข้อมูลที่เชื่อถือไม่ได้ไปเติมเป็น `LatLong_Actual`


ชีต 2 กลุ่มหลักๆ คือ
1.กลุ่มที่ต้องทำความสะอาดข้อมูลดิบ จะมี
ชีตSYS_TH_GEO = ข้อมูลแขวง/ตำบล/เขต/อำเภอ/จังหวัด/รหัสไปรษณย์ไทย , 
ชีตSCGนครหลวงJWDภูมิภาค = ชีตข้อมูลดิบจากคนขับรถที่จะมีความจริง100%คือ LatLong ,
และชีตที่เกี่ยวข้องกับการทำความสะอาดทั้งหมด
2.กลุ่มโหลดข้อมูลใหม่ จะมี
ชีตข้อมูลพนักงาน , 
ชีตสรุป_Shipment ,
ชีตสรุปเจ้าของสินค้า , 
ชีตInput ,
ชีตตารางงานประจำวัน = ชีตนี้นอกจากโหลดข้อมูลใหม่แล้ว เราจะนำเอาชื่อบุคคล(SoldToName) ไปเข้ากระบวนการทำความสะะอาด เหมือนที่เราได้ทำไว้ในกลุ่มที่1
เพื่อใช้ไปทำการค้นหา เพื่อนำLatLong ของจริง เชื่อถือได้ มาใส่ให้ใน LatLong_Actual



🟩 กลุ่มที่ 1: ฝ่ายเรียนรู้และทำความสะอาดข้อมูล (The Cleansing & Master Database)
  - หน้าที่หลัก: กลุ่มนี้ทำหน้าที่เป็น "หน่วยฝึกสมองให้ AI"
    โดยรับข้อมูลที่จบงานแล้วเพื่อมาทำความสะอาด
    สร้างเป็นฐานข้อมูลพิกัด (Master Data) ที่มีความแม่นยำ 100%
กลุ่มที่ต้องทำความสะอาดข้อมูลดิบ จะมีชีตSYS_TH_GEO =
ข้อมูลแขวง/ตำบล/เขต/อำเภอ/จังหวัด/รหัสไปรษณย์ไทย , ชีตSCGนครหลวงJWDภูมิภาค =
ชีตข้อมูลดิบจากคนขับรถที่จะมีความจริง100%คือ LatLong ,
และชีตที่เกี่ยวข้องกับการทำความสะอาดทั้งหมด

  - ชีตที่เกี่ยวข้อง:
    1.  SYS_TH_GEO : เป็นฐานข้อมูลราชการ รหัสไปรษณีย์ เขต/แขวง
        (ใช้อ้างอิงการจัดรูปที่อยู่)
    2.  SCGนครหลวงJWDภูมิภาค : เป็นชีตนำเข้าข้อมูลจากงานในอดีต
        (ซึ่งเรามั่นใจว่าคอลัมน์พิกัด"LatLong" คือจุดส่งของจริงแท้ 100% แม้ชื่อคนกับที่อยู่จะพิมพ์มาสกปรกก็ตาม)
    3.  ชีตฐานข้อมูล AI (M_PERSON, M_PLACE, M_GEO_POINT, M_DESTINATION)
  - Logic การทำงาน: เอางานเก่าจากชีต SCGนครหลวงJWDภูมิภาค มาผ่านโมดูลตัดคำขยะ
    เมื่อได้ชื่อที่สะอาด จะทำการมัดรวมกับ "พิกัดที่แท้จริง" บันทึกเป็น ID
    ลงตาราง M_DESTINATION (เพื่อรอให้กลุ่มที่ 2 เรียกใช้)

🟦 กลุ่มที่ 2: ฝ่ายดึงข้อมูลทำงานประจำวันและเชื่อมพิกัด (The Daily Ops & Search
Integration)
  - หน้าที่หลัก: ใช้รันงานของแต่ละวัน โหลดออร์เดอร์เข้าตารางใหม่ แล้วทำกระบวนการ
    "Vlookup อัจฉริยะ" วิ่งกลับไปยืมพิกัดแท้ๆ จากกลุ่มที่ 1 มาเติมลงหน้าตาราง
  - ชีตที่เกี่ยวข้อง: Input, ข้อมูลพนักงาน, สรุป_Shipment, สรุป_เจ้าของสินค้า,
    และพระเอกคือชีต ตารางงานประจำวัน
กลุ่มโหลดข้อมูลใหม่ จะมีชีตข้อมูลพนักงาน , ชีตสรุป_Shipment ,
ชีตสรุปเจ้าของสินค้า , ชีตInput ,
ชีตตารางงานประจำวัน = ชีตนี้นอกจากโหลดข้อมูลใหม่แล้ว
เราจะเอาชื่อบุคคล ชื่อสถานที่ หรืออะไรก็ตามที่เราได้ทไว้ในกลุ่มที่1
ไปทำการค้นหา เพื่อนำLatLong ของจริง เชื่อถือได้ มาใส่ให้
  - Logic การทำงาน:
    1.  รับคำสั่ง API และโหลด JSON งานใหม่มากางใน ตารางงานประจำวัน
    2.  ข้อมูลที่เพิ่งดึงมานี้ "จะไม่มีพิกัด LatLong" หรือ
        "พิกัดที่ให้มาไม่แม่นยำ"
        และชื่อ/ที่อยู่มักจะเป็นข้อมูลดิบ (สกปรก)
    3.  ระบบจะทำการ ดึง "ชื่อบุคคลดิบ"(ShipToName)ในชีตตารางงานประจำวัน
        ไปเข้าฟังก์ชัน AI ค้นหาในตารางของ "กลุ่มที่ 1 (M_DESTINATION)"
    4.  หากพบความเชื่อมโยง ให้ดึงค่า LatLong (ของแท้ที่ไว้ใจได้)
        มาพิมพ์ลงคอลัมน์ LatLong_Actual
        บนตารางงานประจำวันโดยอัตโนมัติ
        เพื่อให้คนขับเอาไปใช้วิ่งงานต่อได้เลย!
ขอให้คุณยึดบริบท (Business Flow) กลุ่ม 1 (เป็นฝ่ายเตรียมพิกัด) และ กลุ่ม 2
(เป็นฝ่ายเรียกใช้พิกัด) นี้ไว้เป็นแกนหลักตลอดการทำงาน
ห้ามจำสลับกันเด็ดขาด รับทราบนะครับ?


