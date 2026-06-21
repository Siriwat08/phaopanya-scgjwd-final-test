# 📖 LMDS V5.5.020 — พจนานุกรมคอลัมน์ (Column Dictionary)

> **เอกสารฉบับนี้อธิบายความหมายของทุกคอลัมน์ในทุกตารางของระบบ LMDS**
> ใช้สำหรับ Admin / IT / Developer ที่ต้องการเข้าใจว่าแต่ละคอลัมน์เก็บอะไร และค่ามาจากไหน

**เวอร์ชันเอกสาร:** V5.5.017 (2026-06-21)
**ตารางทั้งหมด:** 12 ตาราง (MAPS_CACHE ถูกลบใน V5.5.013 — ใช้ @customFunction formulas แทน; FACT_DELIVERY +2 cols ใน V5.5.014 DRIVER-VERIFIED)
**รูปแบบ:** ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา)

---

## 📋 สารบัญ

1. [M_PERSON — ข้อมูลบุคคลปลายทาง](#1-m_person--ข้อมูลบุคคลปลายทาง)
2. [M_PERSON_ALIAS — ชื่อเรียกอื่นๆ ของบุคคล](#2-m_person_alias--ชื่อเรียกอื่นๆ-ของบุคคล)
3. [M_PLACE — ข้อมูลสถานที่/ที่อยู่](#3-m_place--ข้อมูลสถานที่ที่อยู่)
4. [M_PLACE_ALIAS — ชื่อเรียกอื่นๆ ของสถานที่](#4-m_place_alias--ชื่อเรียกอื่นๆ-ของสถานที่)
5. [M_ALIAS — ตารางกลาง Alias (Hybrid Architecture)](#5-m_alias--ตารางกลาง-alias-hybrid-architecture)
6. [M_GEO_POINT — ข้อมูลพิกัดภูมิศาสตร์](#6-m_geo_point--ข้อมูลพิกัดภูมิศาสตร์)
7. [M_DESTINATION — จุดส่งมอบ (Trinity: Person+Place+Geo)](#7-m_destination--จุดส่งมอบ-trinity-personplacegeo)
8. [FACT_DELIVERY — ตารางธุรกรรมการจัดส่ง](#8-fact_delivery--ตารางธุรกรรมการจัดส่ง)
9. [Q_REVIEW — คิวรอตรวจสอบ](#9-q_review--คิวรอตรวจสอบ)
10. [SYS_CONFIG — การตั้งค่าระบบ](#10-sys_config--การตั้งค่าระบบ)
11. [SYS_LOG — บันทึกระบบ](#11-sys_log--บันทึกระบบ)
12. [RPT_DATA_QUALITY — รายงานคุณภาพข้อมูล](#12-rpt_data_quality--รายงานคุณภาพข้อมูล)

---

## 1. M_PERSON — ข้อมูลบุคคลปลายทาง

**หน้าที่:** เก็บข้อมูลบุคคลที่เป็นปลายทางการจัดส่ง (ชื่อร้านค้า / บุคคลที่รับสินค้า)
**จำนวนคอลัมน์:** 10 คอลัมน์
**IDX constant:** `PERSON_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| M_PERSON | [0] `person_id` | รหัสบุคคล | รหัสเฉพาะของบุคคล (เช่น `P8EB059B4B35E`) — สร้างโดย `generateShortId('P')` ใน 14_Utils.gs |
| M_PERSON | [1] `canonical_name` | ชื่อมาตรฐาน | ชื่อที่สะอาดที่สุดของบุคคลนี้ — มาจาก `getBestName_Smart()` ใน 05_NormalizeService.gs ที่เลือกชื่อที่ดีที่สุดจากหลายๆ variant |
| M_PERSON | [2] `normalized_name` | ชื่อที่ normalize แล้ว | ชื่อที่ผ่าน `normalizeForCompare()` — ตัดคำนำหน้า บริษัท จำกัด ร้าน ฯลฯ ออก เพื่อใช้ค้นหา/จับคู่ |
| M_PERSON | [3] `phone` | เบอร์โทรศัพท์ | เบอร์โทรที่ดึงมาจากชื่อดิบ โดย `normalizePersonNameFull()` ใน 05_NormalizeService.gs |
| M_PERSON | [4] `first_seen` | วันที่เห็นครั้งแรก | วันที่บุคคลนี้ถูกสร้างขึ้นในระบบ — จาก `createPerson()` ใน 06_PersonService.gs |
| M_PERSON | [5] `last_seen` | วันที่เห็นล่าสุด | วันที่บุคคลนี้ถูกอ้างถึงล่าสุด — อัปเดตโดย `batchUpdatePersonStats_()` ทุกครั้งที่ match สำเร็จ |
| M_PERSON | [6] `usage_count` | จำนวนครั้งที่ใช้ | จำนวนครั้งที่บุคคลนี้ถูก match ใน FACT_DELIVERY — อัปเดตโดย `batchUpdateEntityStats_()` |
| M_PERSON | [7] `record_status` | สถานะระเบียน | `Active` = ใช้งาน / `Inactive` = ปิดใช้งาน / `Merged` = รวมเข้าบุคคลอื่นแล้ว |
| M_PERSON | [8] `note` | หมายเหตุ | หมายเหตุเพิ่มเติม (เช่น ฝากยาม, COD, ด่วน) — ดึงมาจาก `normalizePersonNameFull()` |
| M_PERSON | [9] `master_uuid` | UUID หลัก | UUID v4 สำหรับ merge tracking — สร้างโดย `assignMasterUuidIfMissing()` ใน 21_AliasService.gs |

---

## 2. M_PERSON_ALIAS — ชื่อเรียกอื่นๆ ของบุคคล

**หน้าที่:** เก็บชื่อเรียกอื่นๆ ของบุคคลที่อาจเขียนต่างกัน แต่หมายถึงคนเดียวกัน
**จำนวนคอลัมน์:** 6 คอลัมน์
**IDX constant:** `PERSON_ALIAS_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| M_PERSON_ALIAS | [0] `alias_id` | รหัส alias | รหัสเฉพาะของ alias record — สร้างโดย `generateShortId('PA')` |
| M_PERSON_ALIAS | [1] `person_id` | รหัสบุคคล | FK → M_PERSON.person_id — บุคคลที่ alias นี้อ้างถึง |
| M_PERSON_ALIAS | [2] `alias_name` | ชื่อ alias | ชื่อเรียกอื่นของบุคคล (เช่น "ร้านสมชาย" เมื่อ canonical คือ "สมชาย ค้าวัสดุ") |
| M_PERSON_ALIAS | [3] `match_score` | คะแนนการจับคู่ | คะแนน 0-100 ที่บอกว่า alias นี้ตรงกับบุคคลแค่ไหน — จาก `scorePersonCandidate()` |
| M_PERSON_ALIAS | [4] `created_at` | วันที่สร้าง | วันที่ alias นี้ถูกบันทึก — จาก `createPersonAlias()` ใน 06_PersonService.gs |
| M_PERSON_ALIAS | [5] `active_flag` | สถานะใช้งาน | `TRUE` = ยังใช้งาน / `FALSE` = ยกเลิกแล้ว |

---

## 3. M_PLACE — ข้อมูลสถานที่/ที่อยู่

**หน้าที่:** เก็บข้อมูลสถานที่/ที่อยู่ของปลายทาง (แยกจากบุคคล)
**จำนวนคอลัมน์:** 14 คอลัมน์
**IDX constant:** `PLACE_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| M_PLACE | [0] `place_id` | รหัสสถานที่ | รหัสเฉพาะของสถานที่ — สร้างโดย `generateShortId('PL')` |
| M_PLACE | [1] `canonical_name` | ชื่อมาตรฐาน | ชื่อสถานที่ที่สะอาดที่สุด — มาจาก `getBestName_Smart()` |
| M_PLACE | [2] `normalized_name` | ชื่อที่ normalize แล้ว | ชื่อที่ผ่าน `normalizeForCompare()` เพื่อใช้ค้นหา |
| M_PLACE | [3] `place_type` | ประเภทสถานที่ | ประเภทของสถานที่ (เช่น ร้านค้า, คลังสินค้า, บ้าน) |
| M_PLACE | [4] `sub_district` | ตำบล/แขวง | ตำบลหรือแขวง — ดึงจาก `extractGeoFromAddress()` ใน 20_ThGeoService.gs |
| M_PLACE | [5] `district` | อำเภอ/เขต | อำเภอหรือเขต — ดึงจาก `extractGeoFromAddress()` |
| M_PLACE | [6] `province` | จังหวัด | จังหวัด — ดึงจาก `extractGeoFromAddress()` หรือ Google Maps |
| M_PLACE | [7] `postcode` | รหัสไปรษณีย์ | รหัสไปรษณีย์ 5 หลัก — ดึงจาก address หรือ `parseAddressFromText()` |
| M_PLACE | [8] `first_seen` | วันที่เห็นครั้งแรก | วันที่สถานที่นี้ถูกสร้าง — จาก `createPlace()` ใน 07_PlaceService.gs |
| M_PLACE | [9] `last_seen` | วันที่เห็นล่าสุด | วันที่สถานที่ถูกอ้างถึงล่าสุด — อัปเดตโดย `batchUpdatePlaceStats_()` |
| M_PLACE | [10] `usage_count` | จำนวนครั้งที่ใช้ | จำนวนครั้งที่สถานที่นี้ถูก match — อัปเดตโดย `batchUpdateEntityStats_()` |
| M_PLACE | [11] `record_status` | สถานะระเบียน | `Active` / `Inactive` / `Merged` |
| M_PLACE | [12] `note` | หมายเหตุ | หมายเหตุเพิ่มเติม |
| M_PLACE | [13] `master_uuid` | UUID หลัก | UUID v4 สำหรับ merge tracking |

---

## 4. M_PLACE_ALIAS — ชื่อเรียกอื่นๆ ของสถานที่

**หน้าที่:** เก็บชื่อเรียกอื่นๆ ของสถานที่ (เช่น ที่อยู่เขียนต่างกัน)
**จำนวนคอลัมน์:** 6 คอลัมน์
**IDX constant:** `PLACE_ALIAS_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| M_PLACE_ALIAS | [0] `alias_id` | รหัส alias | รหัสเฉพาะของ alias — สร้างโดย `generateShortId('PLA')` |
| M_PLACE_ALIAS | [1] `place_id` | รหัสสถานที่ | FK → M_PLACE.place_id |
| M_PLACE_ALIAS | [2] `alias_name` | ชื่อ alias | ที่อยู่/ชื่อสถานที่ที่เขียนต่างกัน |
| M_PLACE_ALIAS | [3] `match_score` | คะแนนการจับคู่ | คะแนน 0-100 — จาก `scorePlaceCandidate()` |
| M_PLACE_ALIAS | [4] `created_at` | วันที่สร้าง | วันที่ alias นี้ถูกบันทึก |
| M_PLACE_ALIAS | [5] `active_flag` | สถานะใช้งาน | `TRUE` / `FALSE` |

---

## 5. M_ALIAS — ตารางกลาง Alias (Hybrid Architecture)

**หน้าที่:** ตารางกลางสำหรับเชื่อมโยงชื่อสกปรก/ย่อ/ผิด → `master_uuid` → พิกัด
**จำนวนคอลัมน์:** 8 คอลัมน์
**IDX constant:** `ALIAS_IDX` (01_Config.gs)
**⚠️ Single Writer:** เขียนได้เฉพาะ `autoEnrichAliasesFromFactBatch_()` ใน 10_MatchEngine.gs เท่านั้น

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| M_ALIAS | [0] `alias_id` | รหัส alias | รหัสเฉพาะ — สร้างโดย `generateShortId('AL')` |
| M_ALIAS | [1] `master_uuid` | UUID หลัก | UUID ของ entity หลัก (Person หรือ Place) ที่ alias นี้ชี้ไป |
| M_ALIAS | [2] `variant_name` | ชื่อ variant | ชื่อที่เขียนแตกต่างกันแต่หมายถึง entity เดียวกัน — มาจาก FACT_DELIVERY.ship_to_name หรือ ship_to_address |
| M_ALIAS | [3] `entity_type` | ประเภท entity | `PERSON` = ชื่อบุคคล / `PLACE` = ที่อยู่สถานที่ |
| M_ALIAS | [4] `confidence` | ความมั่นใจ | คะแนน 0-100 ว่า alias นี้ตรงกับ master แค่ไหน — จาก `autoEnrichAliasesFromFactBatch_()` |
| M_ALIAS | [5] `source` | แหล่งที่มา | แหล่งที่มาของ alias (เช่น `FACT_DELIVERY`, `SCG_RAW`, `AI_Agent`, `Human`) |
| M_ALIAS | [6] `created_at` | วันที่สร้าง | วันที่ alias ถูกบันทึก |
| M_ALIAS | [7] `active_flag` | สถานะใช้งาน | `TRUE` / `FALSE` |

---

## 6. M_GEO_POINT — ข้อมูลพิกัดภูมิศาสตร์

**หน้าที่:** เก็บพิกัด (lat/lng) ที่ใช้ส่งสินค้า พร้อมที่อยู่ที่แก้ไขแล้ว
**จำนวนคอลัมน์:** 14 คอลัมน์
**IDX constant:** `GEO_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| M_GEO_POINT | [0] `geo_id` | รหัสพิกัด | รหัสเฉพาะ — สร้างโดย `generateShortId('G')` |
| M_GEO_POINT | [1] `lat` | ละติจูด | ละติจูด — มาจาก Source sheet (คนขับส่ง) หรือ Google Maps |
| M_GEO_POINT | [2] `lng` | ลองจิจูด | ลองจิจูด — มาจาก Source sheet หรือ Google Maps |
| M_GEO_POINT | [3] `radius_m` | รัศมี (เมตร) | รัศมีความแม่นยำของพิกัด (เมตร) — ค่าเริ่มต้น 50m |
| M_GEO_POINT | [4] `resolved_address` | ที่อยู่ที่แก้ไขแล้ว | ที่อยู่จาก Google Maps reverse geocode — จาก `GET_ADDR_WITH_CACHE()` ใน 15_GoogleMapsAPI.gs |
| M_GEO_POINT | [5] `province` | จังหวัด | จังหวัด — ดึงจาก `extractGeoFromAddress()` |
| M_GEO_POINT | [6] `district` | อำเภอ/เขต | อำเภอ/เขต — ดึงจาก `extractGeoFromAddress()` |
| M_GEO_POINT | [7] `source` | แหล่งที่มาพิกัด | `SCG_System` = จาก SCG / `Driver_GPS` = จากคนขับ (อนุมัติแล้ว) / `google` = จาก Google Maps |
| M_GEO_POINT | [8] `coord_confidence` | ความมั่นใจพิกัด | คะแนน 0-100 — 50 = SCG System, 95 = Driver GPS (อนุมัติแล้ว) |
| M_GEO_POINT | [9] `first_seen` | วันที่เห็นครั้งแรก | วันที่พิกัดถูกสร้าง |
| M_GEO_POINT | [10] `last_seen` | วันที่เห็นล่าสุด | วันที่พิกัดถูกอ้างถึงล่าสุด |
| M_GEO_POINT | [11] `usage_count` | จำนวนครั้งที่ใช้ | จำนวนครั้งที่พิกัดนี้ถูก match |
| M_GEO_POINT | [12] `record_status` | สถานะระเบียน | `Active` / `Inactive` / `Merged` |
| M_GEO_POINT | [13] `extraction_method` | วิธีการดึงพิกัด | `google` = Google Maps / `place_fallback` = จาก Place / `text_fallback` = จาก text parsing [NEW v5.2.008] |

---

## 7. M_DESTINATION — จุดส่งมอบ (Trinity: Person+Place+Geo)

**หน้าที่:** เชื่อมโยง Person + Place + Geo เป็นจุดส่งมอบเดียว (Trinity Framework)
**จำนวนคอลัมน์:** 11 คอลัมน์
**IDX constant:** `DEST_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| M_DESTINATION | [0] `dest_id` | รหัสจุดส่งมอบ | รหัสเฉพาะ — สร้างโดย `generateShortId('D')` |
| M_DESTINATION | [1] `person_id` | รหัสบุคคล | FK → M_PERSON.person_id |
| M_DESTINATION | [2] `place_id` | รหัสสถานที่ | FK → M_PLACE.place_id |
| M_DESTINATION | [3] `geo_id` | รหัสพิกัด | FK → M_GEO_POINT.geo_id |
| M_DESTINATION | [4] `lat` | ละติจูด | ละติจูด (copy จาก M_GEO_POINT มาเก็บไว้เพื่อเร่งความเร็ว query) |
| M_DESTINATION | [5] `lng` | ลองจิจูด | ลองจิจูด (copy จาก M_GEO_POINT) |
| M_DESTINATION | [6] `route_label` | ป้ายกำกับเส้นทาง | ชื่อเส้นทาง (เช่น "คลัง A → ร้านสมชาย") — ใช้สำหรับรายงาน |
| M_DESTINATION | [7] `delivery_date` | วันที่จัดส่ง | วันที่จัดส่งล่าสุดไปยังจุดนี้ |
| M_DESTINATION | [8] `usage_count` | จำนวนครั้งที่ใช้ | จำนวนครั้งที่จุดส่งมอบนี้ถูกใช้ |
| M_DESTINATION | [9] `last_seen` | วันที่เห็นล่าสุด | วันที่จุดส่งมอบถูกอ้างถึงล่าสุด |
| M_DESTINATION | [10] `record_status` | สถานะระเบียน | `Active` / `Inactive` |

---

## 8. FACT_DELIVERY — ตารางธุรกรรมการจัดส่ง

**หน้าที่:** ตารางธุรกรรมหลัก — บันทึกทุกการจัดส่งพร้อมผลการ match
**จำนวนคอลัมน์:** 34 คอลัมน์ (32 เดิม + 2 ใหม่ใน V5.5.014 DRIVER-VERIFIED)
**IDX constant:** `FACT_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| FACT_DELIVERY | [0] `tx_id` | รหัสธุรกรรม | รหัสเฉพาะ — สร้างโดย `generateShortId('TX')` |
| FACT_DELIVERY | [1] `source_sheet` | ชีตต้นทาง | ชื่อชีตที่ข้อมูลมาจาก (เช่น `SCGนครหลวงJWDภูมิภาค`) |
| FACT_DELIVERY | [2] `source_row_number` | แถวในชีตต้นทาง | หมายเลขแถวในชีตต้นทาง — ใช้สำหรับ trace back |
| FACT_DELIVERY | [3] `source_record_id` | รหัสระเบียนต้นทาง | ID ของ record ใน Source sheet — ใช้สำหรับ lookup |
| FACT_DELIVERY | [4] `delivery_date` | วันที่จัดส่ง | วันที่จัดส่งสินค้า — มาจาก Source sheet |
| FACT_DELIVERY | [5] `delivery_time` | เวลาที่จัดส่ง | เวลาที่จัดส่งสินค้า — มาจาก Source sheet |
| FACT_DELIVERY | [6] `invoice_no` | เลขใบแจ้งหนี้ | เลข Invoice — มาจาก Source sheet (normalize แล้ว) |
| FACT_DELIVERY | [7] `shipment_no` | เลข Shipment | เลข Shipment — มาจาก Source sheet |
| FACT_DELIVERY | [8] `driver_name` | ชื่อคนขับ | ชื่อคนขับ — มาจาก Source sheet |
| FACT_DELIVERY | [9] `truck_license` | ทะเบียนรถ | ทะเบียนรถ — มาจาก Source sheet |
| FACT_DELIVERY | [10] `sold_to_code` | รหัสเจ้าของสินค้า | รหัสเจ้าของสินค้า (Sold-To) — มาจาก Source sheet |
| FACT_DELIVERY | [11] `sold_to_name` | ชื่อเจ้าของสินค้า | ชื่อเจ้าของสินค้า — มาจาก Source sheet |
| FACT_DELIVERY | [12] `ship_to_name` | ชื่อปลายทาง | ชื่อผู้รับ/ร้านค้าปลายทาง — มาจาก Source sheet (ข้อมูลดิบ) |
| FACT_DELIVERY | [13] `ship_to_address` | ที่อยู่ปลายทาง | ที่อยู่ปลายทาง — มาจาก Source sheet (ข้อมูลดิบ) |
| FACT_DELIVERY | [14] `geo_resolved_addr` | ที่อยู่จาก Google | ที่อยู่ที่แก้ไขแล้วจาก Google Maps reverse geocode |
| FACT_DELIVERY | [15] `person_id` | รหัสบุคคล | FK → M_PERSON.person_id — ผลการ match (null ถ้าไม่ match) |
| FACT_DELIVERY | [16] `place_id` | รหัสสถานที่ | FK → M_PLACE.place_id — ผลการ match |
| FACT_DELIVERY | [17] `geo_id` | รหัสพิกัด | FK → M_GEO_POINT.geo_id — ผลการ match |
| FACT_DELIVERY | [18] `dest_id` | รหัสจุดส่งมอบ | FK → M_DESTINATION.dest_id — ผลการ match |
| FACT_DELIVERY | [19] `warehouse` | คลังสินค้าต้นทาง | คลังที่ส่งสินค้าออก — มาจาก Source sheet |
| FACT_DELIVERY | [20] `raw_lat` | ละติจูดดิบ | ละติจูดดิบจาก Source sheet (ก่อน match) |
| FACT_DELIVERY | [21] `raw_lng` | ลองจิจูดดิบ | ลองจิจูดดิบจาก Source sheet |
| FACT_DELIVERY | [22] `match_status` | สถานะการ match | `AUTO_MATCHED` / `CREATED` / `REVIEW` / `NOT_FOUND` / `ERROR` |
| FACT_DELIVERY | [23] `match_confidence` | คะแนนการ match | คะแนน 0-100 — จาก `makeMatchDecision()` ใน 10_MatchEngine.gs |
| FACT_DELIVERY | [24] `match_reason` | เหตุผลการ match | เหตุผลที่ match หรือไม่ match (เช่น `FULL_MATCH`, `GEO_ANCHOR_AUTO`, `FUZZY_HIGH_SCORE_AUTO`) |
| FACT_DELIVERY | [25] `match_action` | การกระทำที่ทำ | `AUTO_MATCH` / `CREATE_NEW` / `REVIEW` / `IGNORE` |
| FACT_DELIVERY | [26] `resolved_lat` | ละติจูดที่ resolve แล้ว | ละติจูดหลัง match (จาก M_GEO_POINT หรือ M_DESTINATION) |
| FACT_DELIVERY | [27] `resolved_lng` | ลองจิจูดที่ resolve แล้ว | ลองจิจูดหลัง match |
| FACT_DELIVERY | [28] `created_at` | วันที่สร้าง | วันที่ record นี้ถูกสร้างใน FACT_DELIVERY |
| FACT_DELIVERY | [29] `updated_at` | วันที่อัปเดต | วันที่ record นี้ถูกอัปเดตล่าสุด |
| FACT_DELIVERY | [30] `record_status` | สถานะระเบียน | `Active` / `Inactive` |
| FACT_DELIVERY | [31] `match_evidence` | หลักฐานการ match | สัญญาณที่ใช้ match (เช่น `name|phone|geo|post_process_v55`) [NEW v5.2.008] |
| FACT_DELIVERY | [32] `driver_verified_name` | ชื่อลูกค้าปลายทางจริง | ชื่อจริงที่คนขับ/ผู้ดูแลยืนยัน — กรอกใน AppSheet หรือ Google Sheet แล้ว copy จาก Source sheet col 37 (ใช้สร้าง alias ด้วย confidence=100, source=DRIVER_VERIFIED) [NEW V5.5.014] |
| FACT_DELIVERY | [33] `driver_verified_addr` | ชื่อสถานที่อยู่ลูกค้าปลายทางจริง | ชื่อสถานที่อยู่จริงที่คนขับ/ผู้ดูแลยืนยัน — copy จาก Source sheet col 38 (ใช้สร้าง alias ด้วย confidence=100, source=DRIVER_VERIFIED) [NEW V5.5.014] |

---

## 9. Q_REVIEW — คิวรอตรวจสอบ

**หน้าที่:** เก็บรายการที่ Match Engine ไม่สามารถตัดสินใจได้อัตโนมัติ รอให้มนุษย์ตรวจสอบ
**จำนวนคอลัมน์:** 22 คอลัมน์
**IDX constant:** `REVIEW_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| Q_REVIEW | [0] `review_id` | รหัส review | รหัสเฉพาะ — สร้างโดย `generateShortId('RV')` |
| Q_REVIEW | [1] `issue_type` | ประเภทปัญหา | ประเภทของปัญหาที่ทำให้ต้อง review (เช่น `GEO_NEARBY_YELLOW`, `NEW_RECORD_PENDING`, `FUZZY_MATCH`) |
| Q_REVIEW | [2] `priority` | ความสำคัญ | 1=สูง / 2=กลาง / 3=ต่ำ — กำหนดโดย `makeMatchDecision()` |
| Q_REVIEW | [3] `source_record_id` | รหัสระเบียนต้นทาง | ID ของ record ใน Source sheet — ใช้ lookup ใน FACT_DELIVERY |
| Q_REVIEW | [4] `source_row_number` | แถวในชีตต้นทาง | หมายเลขแถวใน Source sheet |
| Q_REVIEW | [5] `invoice_no` | เลขใบแจ้งหนี้ | เลข Invoice ของรายการนี้ |
| Q_REVIEW | [6] `raw_person_name` | ชื่อปลายทางดิบ | ชื่อผู้รับดิบจาก Source sheet (ก่อน normalize) |
| Q_REVIEW | [7] `raw_place_name` | ที่อยู่ดิบ | ที่อยู่ดิบจาก Source sheet |
| Q_REVIEW | [8] `raw_system_address` | ที่อยู่จากระบบ | ที่อยู่ที่ระบบแก้ไขแล้ว (จาก Google Maps) |
| Q_REVIEW | [9] `raw_lat` | ละติจูดดิบ | ละติจูดดิบจาก Source sheet |
| Q_REVIEW | [10] `raw_lng` | ลองจิจูดดิบ | ลองจิจูดดิบจาก Source sheet |
| Q_REVIEW | [11] `candidate_person_ids` | รหัสบุคคลที่เป็นไปได้ | JSON array ของ person_id ที่เป็น candidate (เช่น `["P8EB059B4B35E","P1234567890AB"]`) |
| Q_REVIEW | [12] `candidate_place_ids` | รหัสสถานที่ที่เป็นไปได้ | JSON array ของ place_id ที่เป็น candidate |
| Q_REVIEW | [13] `candidate_geo_ids` | รหัสพิกัดที่เป็นไปได้ | JSON array ของ geo_id ที่เป็น candidate |
| Q_REVIEW | [14] `candidate_destination_ids` | รหัสจุดส่งมอบที่เป็นไปได้ | JSON array ของ dest_id ที่เป็น candidate |
| Q_REVIEW | [15] `match_score` | คะแนนการ match | คะแนน 0-100 จาก Match Engine |
| Q_REVIEW | [16] `recommended_action` | การกระทำที่แนะนำ | คำแนะนำจากระบบ (เช่น `MERGE_TO_CANDIDATE:PS-XXXX`, `CREATE_NEW:GP-XXXX`) — คลิกได้เพื่อนำทาง [V5.5.011] |
| Q_REVIEW | [17] `status` | สถานะ | `Pending` = รอตรวจสอบ / `Done` = เสร็จแล้ว / `Auto_Resolved` = ระบบจัดการแล้ว / `Escalated` = ส่งต่อ |
| Q_REVIEW | [18] `reviewer` | ผู้ตรวจสอบ | อีเมลผู้ตรวจสอบ (masked) หรือ `SYSTEM_V55` ถ้า auto-resolve |
| Q_REVIEW | [19] `reviewed_at` | วันที่ตรวจสอบ | วันที่ review เสร็จ |
| Q_REVIEW | [20] `decision` | การตัดสินใจ | `AUTO_MATCH` / `CREATE_NEW` / `MERGE_TO_CANDIDATE` / `IGNORE` / `ESCALATE` |
| Q_REVIEW | [21] `note` | หมายเหตุ | หมายเหตุเพิ่มเติมจาก reviewer หรือระบบ |

---

## 10. SYS_CONFIG — การตั้งค่าระบบ

**หน้าที่:** เก็บการตั้งค่าระบบ (key-value pairs)
**จำนวนคอลัมน์:** 4 คอลัมน์

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| SYS_CONFIG | [0] `config_key` | คีย์การตั้งค่า | ชื่อการตั้งค่า (เช่น `SCHEMA_VERSION`, `LAST_SETUP`) |
| SYS_CONFIG | [1] `config_value` | ค่าการตั้งค่า | ค่าของการตั้งค่า (เช่น `5.5.015`, `2026-06-19`) |
| SYS_CONFIG | [2] `description` | คำอธิบาย | คำอธิบายว่าการตั้งค่านี้คืออะไร |
| SYS_CONFIG | [3] `updated_at` | วันที่อัปเดต | วันที่การตั้งค่านี้ถูกอัปเดตล่าสุด |

---

## 11. SYS_LOG — บันทึกระบบ

**หน้าที่:** เก็บ log ของระบบ (INFO, WARN, ERROR)
**จำนวนคอลัมน์:** 6 คอลัมน์
**IDX constant:** `SYS_LOG_IDX` (01_Config.gs)

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| SYS_LOG | [0] `log_id` | รหัส log | รหัสเฉพาะของ log entry — auto-increment |
| SYS_LOG | [1] `timestamp` | วันเวลา | วันเวลาที่ log เกิดขึ้น |
| SYS_LOG | [2] `module` | โมดูล | โมดูลที่เกิด log (เช่น `MatchEngine`, `SearchService`, `PlaceService`) |
| SYS_LOG | [3] `level` | ระดับความรุนแรง | `INFO` = ข้อมูล / `WARN` = คำเตือน / `ERROR` = ข้อผิดพลาด / `DEBUG` = debug |
| SYS_LOG | [4] `message` | ข้อความ | ข้อความ log — จาก `logInfo()`, `logWarn()`, `logError()`, `logDebug()` ใน 03_SetupSheets.gs |
| SYS_LOG | [5] `details` | รายละเอียด | stack trace หรือรายละเอียดเพิ่มเติม (สำหรับ ERROR) |

---

## 12. RPT_DATA_QUALITY — รายงานคุณภาพข้อมูล

**หน้าที่:** สรุปคุณภาพข้อมูลการ match รายวัน
**จำนวนคอลัมน์:** 8 คอลัมน์

| ตาราง | คอลัมน์ | ชื่อคอลัมน์ภาษาไทย | ผลลัพท์ (ความหมาย / ที่มา) |
|-------|--------|-------------------|---------------------------|
| RPT_DATA_QUALITY | [0] `report_date` | วันที่รายงาน | วันที่ของรายงาน — จาก `buildFullQualityReport()` ใน 13_ReportService.gs |
| RPT_DATA_QUALITY | [1] `total_records` | จำนวนระเบียนทั้งหมด | จำนวน record ทั้งหมดที่ประมวลผลในวันนั้น |
| RPT_DATA_QUALITY | [2] `auto_matched` | จำนวน match อัตโนมัติ | จำนวน record ที่ match สำเร็จอัตโนมัติ (match_status = AUTO_MATCHED) |
| RPT_DATA_QUALITY | [3] `reviewed` | จำนวนที่ผ่าน review | จำนวน record ที่ผ่านการ review โดยมนุษย์ |
| RPT_DATA_QUALITY | [4] `created_new` | จำนวนที่สร้างใหม่ | จำนวน record ที่สร้าง Person/Place/Geo ใหม่ (match_action = CREATE_NEW) |
| RPT_DATA_QUALITY | [5] `failed` | จำนวนที่ล้มเหลว | จำนวน record ที่ match ล้มเหลว (match_status = ERROR หรือ NOT_FOUND) |
| RPT_DATA_QUALITY | [6] `match_rate` | อัตราการ match (%) | เปอร์เซ็นต์การ match สำเร็จ = (auto_matched + reviewed + created_new) / total_records × 100 |
| RPT_DATA_QUALITY | [7] `notes` | หมายเหตุ | หมายเหตุเพิ่มเติมของรายงาน |

---

## 📌 สรุป

| ตาราง | จำนวนคอลัมน์ | IDX constant | หน้าที่หลัก |
|-------|-------------|--------------|------------|
| M_PERSON | 10 | PERSON_IDX | ข้อมูลบุคคลปลายทาง |
| M_PERSON_ALIAS | 6 | PERSON_ALIAS_IDX | ชื่อเรียกอื่นของบุคคล |
| M_PLACE | 14 | PLACE_IDX | ข้อมูลสถานที่/ที่อยู่ |
| M_PLACE_ALIAS | 6 | PLACE_ALIAS_IDX | ชื่อเรียกอื่นของสถานที่ |
| M_ALIAS | 8 | ALIAS_IDX | ตารางกลาง Alias (Hybrid) |
| M_GEO_POINT | 14 | GEO_IDX | พิกัดภูมิศาสตร์ |
| M_DESTINATION | 11 | DEST_IDX | จุดส่งมอบ (Trinity) |
| FACT_DELIVERY | 34 | FACT_IDX | ธุรกรรมการจัดส่ง |
| Q_REVIEW | 22 | REVIEW_IDX | คิวรอตรวจสอบ |
| SYS_CONFIG | 4 | — | การตั้งค่าระบบ |
| SYS_LOG | 6 | SYS_LOG_IDX | บันทึกระบบ |
| RPT_DATA_QUALITY | 8 | — | รายงานคุณภาพข้อมูล |
| **รวม** | **137** | **12 IDX sets** | — |

---

*LMDS V5.5.015 — Column Dictionary — Last Updated: 2026-06-19*
