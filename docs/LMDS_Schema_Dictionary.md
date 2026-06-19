# 📘 พจนานุกรมโครงสร้างข้อมูล (LMDS Schema Dictionary)
**เวอร์ชันระบบ:** V5.5.013 (GOOGLE-MAPS-REFACTOR)
**วันที่สกัดข้อมูล:** 2026-06-19 ล่าสุดจากไฟล์ `01_Config.gs` และ `02_Schema.gs`

เอกสารนี้ใช้สำหรับ **Cross-Check** (ตรวจสอบความถูกต้อง) ระหว่าง "ชื่อชีต", "ชื่อคอลัมน์" (Headers), และ "ตัวแปร Index ในโค้ด" เพื่อให้นักพัฒนาและ AI สามารถอ้างอิงได้อย่างถูกต้อง 100%

> **[V5.5.011] สำคัญ:** ตั้งแต่ V5.5.011 เป็นต้นไป `SCHEMA` object ใน `02_Schema.gs` ครอบคลุมทุกชีตรวมถึง `SCGนครหลวงJWDภูมิภาค` (ชีต SOURCE) และ `ตารางงานประจำวัน` (ชีต DAILY_JOB) แล้ว ทำให้ `getSheetHeaders()` และ `validateSchemaConsistency()` ทำงานได้ครบทุกชีต

---

## 🏗️ กลุ่มที่ 1: Master Data (ฐานข้อมูลหลัก)

### 1. ชีต M_PERSON (ข้อมูลบุคคลหลัก)
- **ตัวแปรเรียกชีต:** `SHEET.M_PERSON`
- **โครงสร้างคอลัมน์ (PERSON_IDX):**
  - [0] `PERSON_IDX.PERSON_ID` ➡️ **"person_id"**
  - [1] `PERSON_IDX.CANONICAL` ➡️ **"canonical_name"**
  - [2] `PERSON_IDX.NORMALIZED` ➡️ **"normalized_name"**
  - [3] `PERSON_IDX.PHONE` ➡️ **"phone"**
  - [4] `PERSON_IDX.FIRST_SEEN` ➡️ **"first_seen"**
  - [5] `PERSON_IDX.LAST_SEEN` ➡️ **"last_seen"**
  - [6] `PERSON_IDX.USAGE_COUNT` ➡️ **"usage_count"**
  - [7] `PERSON_IDX.STATUS` ➡️ **"record_status"**
  - [8] `PERSON_IDX.NOTE` ➡️ **"note"**
  - [9] `PERSON_IDX.MASTER_UUID` ➡️ **"master_uuid"**

### 2. ชีต M_PERSON_ALIAS (คำพ้องชื่อบุคคล)
- **ตัวแปรเรียกชีต:** `SHEET.M_PERSON_ALIAS`
- **โครงสร้างคอลัมน์ (PERSON_ALIAS_IDX):**
  - [0] `PERSON_ALIAS_IDX.ALIAS_ID` ➡️ **"alias_id"**
  - [1] `PERSON_ALIAS_IDX.PERSON_ID` ➡️ **"person_id"**
  - [2] `PERSON_ALIAS_IDX.ALIAS_NAME` ➡️ **"alias_name"**
  - [3] `PERSON_ALIAS_IDX.MATCH_SCORE` ➡️ **"match_score"**
  - [4] `PERSON_ALIAS_IDX.CREATED_AT` ➡️ **"created_at"**
  - [5] `PERSON_ALIAS_IDX.ACTIVE_FLAG` ➡️ **"active_flag"**

### 3. ชีต M_PLACE (ข้อมูลสถานที่หลัก)
- **ตัวแปรเรียกชีต:** `SHEET.M_PLACE`
- **โครงสร้างคอลัมน์ (PLACE_IDX):**
  - [0] `PLACE_IDX.PLACE_ID` ➡️ **"place_id"**
  - [1] `PLACE_IDX.CANONICAL` ➡️ **"canonical_name"**
  - [2] `PLACE_IDX.NORMALIZED` ➡️ **"normalized_name"**
  - [3] `PLACE_IDX.PLACE_TYPE` ➡️ **"place_type"**
  - [4] `PLACE_IDX.SUB_DISTRICT` ➡️ **"sub_district"**
  - [5] `PLACE_IDX.DISTRICT` ➡️ **"district"**
  - [6] `PLACE_IDX.PROVINCE` ➡️ **"province"**
  - [7] `PLACE_IDX.POSTCODE` ➡️ **"postcode"**
  - [8] `PLACE_IDX.FIRST_SEEN` ➡️ **"first_seen"**
  - [9] `PLACE_IDX.LAST_SEEN` ➡️ **"last_seen"**
  - [10] `PLACE_IDX.USAGE_COUNT` ➡️ **"usage_count"**
  - [11] `PLACE_IDX.STATUS` ➡️ **"record_status"**
  - [12] `PLACE_IDX.NOTE` ➡️ **"note"**
  - [13] `PLACE_IDX.MASTER_UUID` ➡️ **"master_uuid"**

### 4. ชีต M_PLACE_ALIAS (คำพ้องสถานที่)
- **ตัวแปรเรียกชีต:** `SHEET.M_PLACE_ALIAS`
- **โครงสร้างคอลัมน์ (PLACE_ALIAS_IDX):**
  - [0] `PLACE_ALIAS_IDX.ALIAS_ID` ➡️ **"alias_id"**
  - [1] `PLACE_ALIAS_IDX.PLACE_ID` ➡️ **"place_id"**
  - [2] `PLACE_ALIAS_IDX.ALIAS_NAME` ➡️ **"alias_name"**
  - [3] `PLACE_ALIAS_IDX.MATCH_SCORE` ➡️ **"match_score"**
  - [4] `PLACE_ALIAS_IDX.CREATED_AT` ➡️ **"created_at"**
  - [5] `PLACE_ALIAS_IDX.ACTIVE_FLAG` ➡️ **"active_flag"**

### 5. ชีต M_ALIAS (ระบบ Alias กลาง)
- **ตัวแปรเรียกชีต:** `SHEET.M_ALIAS`
- **โครงสร้างคอลัมน์ (ALIAS_IDX):**
  - [0] `ALIAS_IDX.ALIAS_ID` ➡️ **"alias_id"**
  - [1] `ALIAS_IDX.MASTER_UUID` ➡️ **"master_uuid"**
  - [2] `ALIAS_IDX.VARIANT_NAME` ➡️ **"variant_name"**
  - [3] `ALIAS_IDX.ENTITY_TYPE` ➡️ **"entity_type"**
  - [4] `ALIAS_IDX.CONFIDENCE` ➡️ **"confidence"**
  - [5] `ALIAS_IDX.SOURCE` ➡️ **"source"**
  - [6] `ALIAS_IDX.CREATED_AT` ➡️ **"created_at"**
  - [7] `ALIAS_IDX.ACTIVE_FLAG` ➡️ **"active_flag"**

### 6. ชีต M_GEO_POINT (ข้อมูลพิกัด)
- **ตัวแปรเรียกชีต:** `SHEET.M_GEO_POINT`
- **โครงสร้างคอลัมน์ (GEO_IDX):**
  - [0] `GEO_IDX.GEO_ID` ➡️ **"geo_id"**
  - [1] `GEO_IDX.LAT` ➡️ **"lat"**
  - [2] `GEO_IDX.LNG` ➡️ **"lng"**
  - [3] `GEO_IDX.RADIUS_M` ➡️ **"radius_m"**
  - [4] `GEO_IDX.RESOLVED_ADDR` ➡️ **"resolved_address"**
  - [5] `GEO_IDX.PROVINCE` ➡️ **"province"**
  - [6] `GEO_IDX.DISTRICT` ➡️ **"district"**
  - [7] `GEO_IDX.SOURCE` ➡️ **"source"**
  - [8] `GEO_IDX.CONFIDENCE` ➡️ **"coord_confidence"**
  - [9] `GEO_IDX.FIRST_SEEN` ➡️ **"first_seen"**
  - [10] `GEO_IDX.LAST_SEEN` ➡️ **"last_seen"**
  - [11] `GEO_IDX.USAGE_COUNT` ➡️ **"usage_count"**
  - [12] `GEO_IDX.STATUS` ➡️ **"record_status"**
  - [13] `GEO_IDX.EXTRACTION` ➡️ **"extraction_method"**

### 7. ชีต M_DESTINATION (ปลายทางจัดส่ง)
- **ตัวแปรเรียกชีต:** `SHEET.M_DESTINATION`
- **โครงสร้างคอลัมน์ (DEST_IDX):**
  - [0] `DEST_IDX.DEST_ID` ➡️ **"dest_id"**
  - [1] `DEST_IDX.PERSON_ID` ➡️ **"person_id"**
  - [2] `DEST_IDX.PLACE_ID` ➡️ **"place_id"**
  - [3] `DEST_IDX.GEO_ID` ➡️ **"geo_id"**
  - [4] `DEST_IDX.LAT` ➡️ **"lat"**
  - [5] `DEST_IDX.LNG` ➡️ **"lng"**
  - [6] `DEST_IDX.ROUTE_LABEL` ➡️ **"route_label"**
  - [7] `DEST_IDX.DELIVERY_DATE` ➡️ **"delivery_date"**
  - [8] `DEST_IDX.USAGE_COUNT` ➡️ **"usage_count"**
  - [9] `DEST_IDX.LAST_SEEN` ➡️ **"last_seen"**
  - [10] `DEST_IDX.STATUS` ➡️ **"record_status"**

---

## 📊 กลุ่มที่ 2: Fact Table & Queue (ข้อมูลรายการเคลื่อนไหว)

### 8. ชีต FACT_DELIVERY (รายการจัดส่งที่ประมวลผลแล้ว)
- **ตัวแปรเรียกชีต:** `SHEET.FACT_DELIVERY`
- **โครงสร้างคอลัมน์ (FACT_IDX):**
  - [0] `FACT_IDX.TX_ID` ➡️ **"tx_id"**
  - [1] `FACT_IDX.SOURCE_SHEET` ➡️ **"source_sheet"**
  - [2] `FACT_IDX.SOURCE_ROW` ➡️ **"source_row_number"**
  - [3] `FACT_IDX.SOURCE_REC_ID` ➡️ **"source_record_id"**
  - [4] `FACT_IDX.DELIVERY_DATE` ➡️ **"delivery_date"**
  - [5] `FACT_IDX.DELIVERY_TIME` ➡️ **"delivery_time"**
  - [6] `FACT_IDX.INVOICE_NO` ➡️ **"invoice_no"**
  - [7] `FACT_IDX.SHIPMENT_NO` ➡️ **"shipment_no"**
  - [8] `FACT_IDX.DRIVER_NAME` ➡️ **"driver_name"**
  - [9] `FACT_IDX.TRUCK_LICENSE` ➡️ **"truck_license"**
  - [10] `FACT_IDX.SOLD_TO_CODE` ➡️ **"sold_to_code"**
  - [11] `FACT_IDX.SOLD_TO_NAME` ➡️ **"sold_to_name"**
  - [12] `FACT_IDX.SHIP_TO_NAME` ➡️ **"ship_to_name"**
  - [13] `FACT_IDX.SHIP_TO_ADDR` ➡️ **"ship_to_address"**
  - [14] `FACT_IDX.GEO_RESOLVED_ADDR` ➡️ **"geo_resolved_addr"**
  - [15] `FACT_IDX.PERSON_ID` ➡️ **"person_id"**
  - [16] `FACT_IDX.PLACE_ID` ➡️ **"place_id"**
  - [17] `FACT_IDX.GEO_ID` ➡️ **"geo_id"**
  - [18] `FACT_IDX.DEST_ID` ➡️ **"dest_id"**
  - [19] `FACT_IDX.WAREHOUSE` ➡️ **"warehouse"**
  - [20] `FACT_IDX.RAW_LAT` ➡️ **"raw_lat"**
  - [21] `FACT_IDX.RAW_LNG` ➡️ **"raw_lng"**
  - [22] `FACT_IDX.MATCH_STATUS` ➡️ **"match_status"**
  - [23] `FACT_IDX.MATCH_CONF` ➡️ **"match_confidence"**
  - [24] `FACT_IDX.MATCH_REASON` ➡️ **"match_reason"**
  - [25] `FACT_IDX.MATCH_ACTION` ➡️ **"match_action"**
  - [26] `FACT_IDX.RESOLVED_LAT` ➡️ **"resolved_lat"**
  - [27] `FACT_IDX.RESOLVED_LNG` ➡️ **"resolved_lng"**
  - [28] `FACT_IDX.CREATED_AT` ➡️ **"created_at"**
  - [29] `FACT_IDX.UPDATED_AT` ➡️ **"updated_at"**
  - [30] `FACT_IDX.RECORD_STATUS` ➡️ **"record_status"**
  - [31] `FACT_IDX.EVIDENCE` ➡️ **"match_evidence"**

### 9. ชีต Q_REVIEW (คิวตรวจสอบด้วยคน)
- **ตัวแปรเรียกชีต:** `SHEET.Q_REVIEW`
- **โครงสร้างคอลัมน์ (REVIEW_IDX):**
  - [0] `REVIEW_IDX.REVIEW_ID` ➡️ **"review_id"**
  - [1] `REVIEW_IDX.ISSUE_TYPE` ➡️ **"issue_type"**
  - [2] `REVIEW_IDX.PRIORITY` ➡️ **"priority"**
  - [3] `REVIEW_IDX.SOURCE_REC_ID` ➡️ **"source_record_id"**
  - [4] `REVIEW_IDX.SOURCE_ROW` ➡️ **"source_row_number"**
  - [5] `REVIEW_IDX.INVOICE_NO` ➡️ **"invoice_no"**
  - [6] `REVIEW_IDX.RAW_PERSON` ➡️ **"raw_person_name"**
  - [7] `REVIEW_IDX.RAW_PLACE` ➡️ **"raw_place_name"**
  - [8] `REVIEW_IDX.RAW_SYS_ADDR` ➡️ **"raw_system_address"**
  - [9] `REVIEW_IDX.RAW_LAT` ➡️ **"raw_lat"**
  - [10] `REVIEW_IDX.RAW_LNG` ➡️ **"raw_lng"**
  - [11] `REVIEW_IDX.CAND_PERSONS` ➡️ **"candidate_person_ids"**
  - [12] `REVIEW_IDX.CAND_PLACES` ➡️ **"candidate_place_ids"**
  - [13] `REVIEW_IDX.CAND_GEOS` ➡️ **"candidate_geo_ids"**
  - [14] `REVIEW_IDX.CAND_DESTS` ➡️ **"candidate_destination_ids"**
  - [15] `REVIEW_IDX.MATCH_SCORE` ➡️ **"match_score"**
  - [16] `REVIEW_IDX.RECOMMEND` ➡️ **"recommended_action"**
  - [17] `REVIEW_IDX.STATUS` ➡️ **"status"**
  - [18] `REVIEW_IDX.REVIEWER` ➡️ **"reviewer"**
  - [19] `REVIEW_IDX.REVIEWED_AT` ➡️ **"reviewed_at"**
  - [20] `REVIEW_IDX.DECISION` ➡️ **"decision"**
  - [21] `REVIEW_IDX.NOTE` ➡️ **"note"**

---

## 📥 กลุ่มที่ 3: Raw Data (ข้อมูลดิบที่ผู้ใช้มีอยู่)

### 10. ชีต SCGนครหลวงJWDภูมิภาค (ข้อมูลดิบ)
- **ตัวแปรเรียกชีต:** `SHEET.SOURCE`
- **SCHEMA Entry:** `SCHEMA['SCGนครหลวงJWDภูมิภาค']` [ADD V5.5.011]
- **โครงสร้างคอลัมน์ (SRC_IDX):**
  - [0] `SRC_IDX.ROW_ID` ➡️ **"head"** (ลำดับ)
  - [1] `SRC_IDX.SOURCE_ID` ➡️ **"ID_SCGนครหลวงJWDภูมิภาค"**
  - [2] `SRC_IDX.DELIVERY_DATE` ➡️ **"วันที่ส่งสินค้า"**
  - [3] `SRC_IDX.DELIVERY_TIME` ➡️ **"เวลาที่ส่งสินค้า"**
  - [4] `SRC_IDX.LATLNG_COMBINED` ➡️ **"จุดส่งสินค้าปลายทาง"**
  - [5] `SRC_IDX.DRIVER_NAME` ➡️ **"ชื่อ - นามสกุล"**
  - [6] `SRC_IDX.TRUCK_LICENSE` ➡️ **"ทะเบียนรถ"**
  - [7] `SRC_IDX.SHIPMENT_NO` ➡️ **"Shipment No"**
  - [8] `SRC_IDX.INVOICE_NO` ➡️ **"Invoice No"**
  - [9] `SRC_IDX.BILL_PHOTO` ➡️ **"รูปถ่ายบิลส่งสินค้า"**
  - [10] `SRC_IDX.CUSTOMER_CODE` ➡️ **"รหัสลูกค้า"**
  - [11] `SRC_IDX.SOLD_TO_NAME` ➡️ **"ชื่อเจ้าของสินค้า"**
  - [12] `SRC_IDX.RAW_PERSON_NAME` ➡️ **"ชื่อปลายทาง"**
  - [13] `SRC_IDX.EMPLOYEE_EMAIL` ➡️ **"Email พนักงาน"**
  - [14] `SRC_IDX.LAT` ➡️ **"LAT"**
  - [15] `SRC_IDX.LNG` ➡️ **"LONG"**
  - [16] `SRC_IDX.DOC_RETURN_ID` ➡️ **"ID_Doc_Return"**
  - [17] `SRC_IDX.WAREHOUSE` ➡️ **"คลังสินค้า"**
  - [18] `SRC_IDX.RAW_ADDRESS` ➡️ **"ที่อยู่ปลายทาง"**
  - [19] `SRC_IDX.PHOTO_PRODUCT` ➡️ **"รูปสินค้าตอนส่ง"**
  - [20] `SRC_IDX.PHOTO_STORE` ➡️ **"รูปหน้าร้าน/บ้าน"**
  - [21] `SRC_IDX.REMARK` ➡️ **"หมายเหตุ"**
  - [22] `SRC_IDX.MONTH` ➡️ **"เดือน"**
  - [23] `SRC_IDX.DIST_FROM_WH` ➡️ **"ระยะทางจากคลัง_Km"**
  - [24] `SRC_IDX.RESOLVED_ADDR` ➡️ **"ชื่อที่อยู่จาก_LatLong"**
  - [25] `SRC_IDX.SM_LINK` ➡️ **"SM_Link_SCG"**
  - [26] `SRC_IDX.EMPLOYEE_ID` ➡️ **"ID_พนักงาน"**
  - [27] `SRC_IDX.GPS_ON_SUBMIT` ➡️ **"พิกัดตอนกดบันทึกงาน"**
  - [28] `SRC_IDX.TIME_START` ➡️ **"เวลาเริ่มกรอกงาน"**
  - [29] `SRC_IDX.TIME_DONE` ➡️ **"เวลาบันทึกงานสำเร็จ"**
  - [30] `SRC_IDX.MOVE_DIST_M` ➡️ **"ระยะขยับจากจุดเริ่มต้น_เมตร"**
  - [31] `SRC_IDX.WORK_MIN` ➡️ **"ระยะเวลาใช้งาน_นาที"**
  - [32] `SRC_IDX.SPEED_MPM` ➡️ **"ความเร็วการเคลื่อนที่_เมตร_นาที"**
  - [33] `SRC_IDX.QC_RESULT` ➡️ **"ผลการตรวจสอบงานส่ง"**
  - [34] `SRC_IDX.QC_ISSUE` ➡️ **"เหตุผิดปกติที่ตรวจพบ"**
  - [35] `SRC_IDX.PHOTO_TIME` ➡️ **"เวลาถ่ายรูปหน้าร้าน_หน้าบ้าน"**
  - [36] `SRC_IDX.SYNC_STATUS` ➡️ **"SYNC_STATUS"**

### 11. ชีต ตารางงานประจำวัน
- **ตัวแปรเรียกชีต:** `SHEET.DAILY_JOB`
- **โครงสร้างคอลัมน์ (DATA_IDX):**
  - [0] `DATA_IDX.JOB_ID` ➡️ **"ID_งานประจำวัน"**
  - [1] `DATA_IDX.PLAN_DELIVERY` ➡️ **"PlanDelivery"**
  - [2] `DATA_IDX.INVOICE_NO` ➡️ **"InvoiceNo"**
  - [3] `DATA_IDX.SHIPMENT_NO` ➡️ **"ShipmentNo"**
  - [4] `DATA_IDX.DRIVER_NAME` ➡️ **"DriverName"**
  - [5] `DATA_IDX.TRUCK_LICENSE` ➡️ **"TruckLicense"**
  - [6] `DATA_IDX.CARRIER_CODE` ➡️ **"CarrierCode"**
  - [7] `DATA_IDX.CARRIER_NAME` ➡️ **"CarrierName"**
  - [8] `DATA_IDX.SOLD_TO_CODE` ➡️ **"SoldToCode"**
  - [9] `DATA_IDX.SOLD_TO_NAME` ➡️ **"SoldToName"**
  - [10] `DATA_IDX.SHIP_TO_NAME` ➡️ **"ShipToName"**
  - [11] `DATA_IDX.SHIP_TO_ADDR` ➡️ **"ShipToAddress"**
  - [12] `DATA_IDX.LATLNG_SCG` ➡️ **"LatLong_SCG"**
  - [13] `DATA_IDX.MATERIAL` ➡️ **"MaterialName"**
  - [14] `DATA_IDX.QTY` ➡️ **"ItemQuantity"**
  - [15] `DATA_IDX.QTY_UNIT` ➡️ **"QuantityUnit"**
  - [16] `DATA_IDX.WEIGHT` ➡️ **"ItemWeight"**
  - [17] `DATA_IDX.DELIVERY_NO` ➡️ **"DeliveryNo"**
  - [18] `DATA_IDX.DEST_COUNT` ➡️ **"จำนวนปลายทาง_System"**
  - [19] `DATA_IDX.DEST_LIST` ➡️ **"รายชื่อปลายทาง_System"**
  - [20] `DATA_IDX.SCAN_STATUS` ➡️ **"ScanStatus"**
  - [21] `DATA_IDX.DELIVERY_STATUS` ➡️ **"DeliveryStatus"**
  - [22] `DATA_IDX.EMAIL` ➡️ **"Email พนักงาน"**
  - [23] `DATA_IDX.TOT_QTY` ➡️ **"จำนวนสินค้ารวมของร้านนี้"**
  - [24] `DATA_IDX.TOT_WEIGHT` ➡️ **"น้ำหนักสินค้ารวมของร้านนี้"**
  - [25] `DATA_IDX.SCAN_INV` ➡️ **"จำนวน_Invoice_ที่ต้องสแกน"**
  - [26] `DATA_IDX.LATLNG_ACTUAL` ➡️ **"LatLong_Actual"**
  - [27] `DATA_IDX.OWNER_LABEL` ➡️ **"ชื่อเจ้าของสินค้า_Invoice_ที่ต้องสแกน"**
  - [28] `DATA_IDX.SHOP_KEY` ➡️ **"ShopKey"**

### 12. ชีต ข้อมูลพนักงาน
- **ตัวแปรเรียกชีต:** `SHEET.EMPLOYEE`
- **โครงสร้างคอลัมน์ (EMPLOYEE_IDX):**
  - [0] `EMPLOYEE_IDX.EMP_ID` ➡️ **"ID_พนักงาน"**
  - [1] `EMPLOYEE_IDX.FULL_NAME` ➡️ **"ชื่อ - นามสกุล"**
  - [2] `EMPLOYEE_IDX.PHONE` ➡️ **"เบอร์โทรศัพท์"**
  - [3] `EMPLOYEE_IDX.NATIONAL_ID` ➡️ **"เลขที่บัตรประชาชน"**
  - [4] `EMPLOYEE_IDX.TRUCK_LIC` ➡️ **"ทะเบียนรถ"**
  - [5] `EMPLOYEE_IDX.TRUCK_TYPE` ➡️ **"เลือกประเภทรถยนต์"**
  - [6] `EMPLOYEE_IDX.EMAIL` ➡️ **"Email พนักงาน"**
  - [7] `EMPLOYEE_IDX.ROLE` ➡️ **"ROLE"**

### 13. ชีต Input
- **ตัวแปรเรียกชีต:** `SHEET.INPUT`
- **โครงสร้างคอลัมน์:**
  - [0] (Cell A1) ➡️ **"COOKIE"**
  - [1] (Cell A3) ➡️ **"ShipmentNos"**

---

## ⚙️ กลุ่มที่ 4: System Support (ระบบรองรับและการตั้งค่า)

### 14. ชีต SYS_TH_GEO (ฐานข้อมูลรหัสไปรษณีย์)
- **ตัวแปรเรียกชีต:** `SHEET.SYS_TH_GEO`
- **โครงสร้างคอลัมน์ (TH_GEO_IDX):**
  - [0] `TH_GEO_IDX.POSTCODE` ➡️ **"รหัสไปรษณีย์"**
  - [1] `TH_GEO_IDX.SUB_DISTRICT` ➡️ **"แขวง/ตำบล"**
  - [2] `TH_GEO_IDX.DISTRICT` ➡️ **"เขต/อำเภอ"**
  - [3] `TH_GEO_IDX.PROVINCE` ➡️ **"จังหวัด"**
  - [4] `TH_GEO_IDX.NOTE` ➡️ **"หมายเหตุ"**
  - [5] `TH_GEO_IDX.SUB_DISTRICT_CLEAN` ➡️ **"ตำบล_clean"**
  - [6] `TH_GEO_IDX.DISTRICT_CLEAN` ➡️ **"อำเภอ_clean"**
  - [7] `TH_GEO_IDX.SUB_DISTRICT_LABEL` ➡️ **"ตำบล_label"**
  - [8] `TH_GEO_IDX.DISTRICT_LABEL` ➡️ **"อำเภอ_label"**
  - [9] `TH_GEO_IDX.TAMBON_NORM` ➡️ **"tambon_norm"**
  - [10] `TH_GEO_IDX.AMPHOE_NORM` ➡️ **"amphoe_norm"**
  - [11] `TH_GEO_IDX.PROVINCE_NORM` ➡️ **"province_norm"**
  - [12] `TH_GEO_IDX.SEARCH_KEY` ➡️ **"search_key"**
  - [13] `TH_GEO_IDX.POSTAL_KEY` ➡️ **"postal_key"**
  - [14] `TH_GEO_IDX.NOTE_TYPE` ➡️ **"note_type"**
  - [15] `TH_GEO_IDX.NOTE_SCOPE` ➡️ **"note_scope"**

### 15. ชีต สรุป_เจ้าของสินค้า
- **ตัวแปรเรียกชีต:** `SHEET.OWNER_SUMMARY`
- **โครงสร้างคอลัมน์ (OWNER_SUM_IDX):**
  - [0] `OWNER_SUM_IDX.SUMMARY_KEY` ➡️ **"SummaryKey"**
  - [1] `OWNER_SUM_IDX.SOLD_TO` ➡️ **"SoldToName"**
  - [2] `OWNER_SUM_IDX.PLAN_DEL` ➡️ **"PlanDelivery"**
  - [3] `OWNER_SUM_IDX.QTY_ALL` ➡️ **"จำนวน_ทั้งหมด"**
  - [4] `OWNER_SUM_IDX.QTY_EPOD` ➡️ **"จำนวน_E-POD_ทั้งหมด"**
  - [5] `OWNER_SUM_IDX.LAST_UPDATE` ➡️ **"LastUpdated"**

### 16. ชีต สรุป_Shipment
- **ตัวแปรเรียกชีต:** `SHEET.SHIPMENT_SUM`
- **โครงสร้างคอลัมน์ (SHIPMENT_SUM_IDX):**
  - [0] `SHIPMENT_SUM_IDX.SHIPMENT_KEY` ➡️ **"ShipmentKey"**
  - [1] `SHIPMENT_SUM_IDX.SHIPMENT_NO` ➡️ **"ShipmentNo"**
  - [2] `SHIPMENT_SUM_IDX.TRUCK` ➡️ **"TruckLicense"**
  - [3] `SHIPMENT_SUM_IDX.PLAN_DEL` ➡️ **"PlanDelivery"**
  - [4] `SHIPMENT_SUM_IDX.QTY_ALL` ➡️ **"จำนวน_ทั้งหมด"**
  - [5] `SHIPMENT_SUM_IDX.QTY_EPOD` ➡️ **"จำนวน_E-POD_ทั้งหมด"**
  - [6] `SHIPMENT_SUM_IDX.LAST_UPDATE` ➡️ **"LastUpdated"**

### 17. ชีต SYS_LOG
- **ตัวแปรเรียกชีต:** `SHEET.SYS_LOG`
- **โครงสร้างคอลัมน์ (SYS_LOG_IDX):**
  - [0] `SYS_LOG_IDX.LOG_ID` ➡️ **"log_id"**
  - [1] `SYS_LOG_IDX.TIMESTAMP` ➡️ **"timestamp"**
  - [2] `SYS_LOG_IDX.MODULE` ➡️ **"module"**
  - [3] `SYS_LOG_IDX.LEVEL` ➡️ **"level"**
  - [4] `SYS_LOG_IDX.MESSAGE` ➡️ **"message"**
  - [5] `SYS_LOG_IDX.DETAILS` ➡️ **"details"**

### 18. ชีต SYS_CONFIG
- **ตัวแปรเรียกชีต:** `SHEET.SYS_CONFIG`
- **โครงสร้างคอลัมน์:**
  - [0] ➡️ **"config_key"**
  - [1] ➡️ **"config_value"**
  - [2] ➡️ **"description"**
  - [3] ➡️ **"updated_at"**

### 19. ชีต RPT_DATA_QUALITY
- **ตัวแปรเรียกชีต:** `SHEET.RPT_QUALITY`
- **โครงสร้างคอลัมน์:**
  - [0] ➡️ **"report_date"**
  - [1] ➡️ **"total_records"**
  - [2] ➡️ **"auto_matched"**
  - [3] ➡️ **"reviewed"**
  - [4] ➡️ **"created_new"**
  - [5] ➡️ **"failed"**
  - [6] ➡️ **"match_rate"**
  - [7] ➡️ **"notes"**

---

## 21. FIRST_AUDIT_REVIEW15 + REFACTOR — ผลการตรวจสอบคุณภาพโค้ด (2026-06-12)

ระบบ LMDS V5.5 ผ่านการตรวจสอบคุณภาพโค้ดตามกฎเหล็ก 16 ข้อ (Audit Cycle: FIRST_AUDIT_REVIEW15 → FIX_REVIEW15_PLAN → APPLY_REVIEW15_FIX → VERIFY_REVIEW15_FIX → REFACTOR)

**ผลลัพธ์:** Compliance 8/16 PASS → 16/16 PASS (+5 REVIEW15) → **16/16 COMPLIANT** (+2 REFACTOR) | 14+16 ไฟล์แก้ไข | 190 Helper Functions ใหม่ (18 SRP + 172 REFACTOR) | 1 Critical Bug Hot-Fixed | 21 REF issues

การเปลี่ยนแปลงหลัก:
- Phantom Call `invalidateGlobalAliasCache_()` → `CacheService.removeAll()` โดยตรง
- Hardcode Index 9 จุด → `*_IDX` constants
- logError 8 จุด + `new Error()` stack trace
- Dead Code ลบ (extractTextPriority_ + fuzzyMatchAddress จาก 07_PlaceService.gs)
- ตัวแปรเปลี่ยนชื่อ (d→districtName/parsedDate/district, r→aliasRow, e→i)
- @public tags เพิ่ม 5 ฟังก์ชัน
- 18 SRP Helper Functions แยกออก
- Time Guard + Checkpoint เพิ่ม 2 ฟังก์ชัน (buildGeoDictionary, populateGeoMetadata)
- Critical Bug: `newRows.push(r)` → `newRows.push(aliasRow)` ใน 19_Hardening.gs

**REFACTOR Cycle เพิ่มเติม:**
- `resolveAndPersist_` gateway pattern (REF-001) — ลดการเขียนซ้ำใน Alias
- `cachedGeoLookup_` 3-layer cache (REF-016) — RAM → CacheService → Sheet → API
- `transformGeoMetadataRow_` + `flushGeoMetadataBatch_` (REF-006) — populateGeoMetadata split
- `stripThaiAdminPrefix_` / `stripThaiProvincePrefix_` (REF-014) — ตัดคำนำหน้าหน่วยการปกครอง
- ข้อ 9 (No Global State): RAM caches ที่คงเหลือ (เช่น `_GLOBAL_GEO_DICT_CACHE`) เป็นที่ยอมรับได้ตามสถาปัตยกรรม GAS → NICE_TO_HAVE → PASS
