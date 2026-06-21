# 📘 LMDS System Guide — คู่มือระบบฉบับเต็ม

> **Logistics Master Data System (LMDS)** — ระบบจัดการข้อมูลหลักด้านโลจิสติกส์
> เวอร์ชัน: V5.5.017 (SECURITY-POSTFIX) | อัปเดตล่าสุด: 2026-06-21
> แพลตฟอร์ม: Google Apps Script (GAS) บน Google Sheets
> ฟังก์ชันทั้งหมด: 321 | บรรทัดโค้ด: ~17,399 | Production Readiness: 97% (Security Hardened)

---

## สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [สถาปัตยกรรมหลัก](#2-สถาปัตยกรรมหลัก)
3. [โมดูลทั้ง 22 ไฟล์ — ทำอะไรบ้าง](#3-โมดูลทั้ง-22-ไฟล์--ทำอะไรบ้าง)
4. [ชีตทั้ง 19 ตาราง — เก็บอะไรบ้าง](#4-ชีตทั้ง-19-ตาราง--เก็บอะไรบ้าง)
5. [คอลัมน์/ชีตเชื่อมกันยังไง (Data Relationships)](#5-คอลัมน์ชีตเชื่อมกันยังไง-data-relationships)
6. [Pipeline ทำงานยังไง (Step-by-Step)](#6-pipeline-ทำงานยังไง-step-by-step)
7. [Match Engine — กฎ 8 ข้อที่ตัดสินใจจับคู่](#7-match-engine--กฎ-8-ข้อที่ตัดสินใจจับคู่)
8. [Search Service — 2-Tier ค้นหาพิกัด](#8-search-service--2-tier-ค้นหาพิกัด)
9. [Hybrid Alias Architecture — ระบบจดจำชื่อ](#9-hybrid-alias-architecture--ระบบจดจำชื่อ)
10. [Human-in-the-Loop — ระบบรีวิว](#10-human-in-the-loop--ระบบรีวิว)
11. [เมนูผู้ใช้ — กดอะไรได้บ้าง](#11-เมนูผู้ใช้--กดอะไรได้บ้าง)
12. [การตั้งค่าระบบครั้งแรก (First-Time Setup)](#12-การตั้งค่าระบบครั้งแรก-first-time-setup)
13. [การดูแลระบบ (Maintenance)](#13-การดูแลระบบ-maintenance)
14. [การแก้ปัญหาเบื้องต้น (Troubleshooting)](#14-การแก้ปัญหาเบื้องต้น-troubleshooting)
15. [คำศัพท์สำคัญ (Glossary)](#15-คำศัพท์สำคัญ-glossary)

---

## 1. ภาพรวมระบบ

LMDS (Logistics Master Data System) คือระบบที่ทำหน้าที่ **รับข้อมูลขนส่งที่คุณภาพไม่สม่ำเสมอ → ทำความสะอาด → จับคู่กับฐานข้อมูลหลัก → บันทึกผล** โดยอัตโนมัติ ระบบออกแบบมาเพื่อแก้ปัญหาหลัก 3 อย่าง:

| ปัญหา | LMDS แก้อย่างไร |
|-------|-----------------|
| ข้อมูลขนส่งพิมพ์ผิด ชื่อไม่ตรง ที่อยู่ไม่ครบ | NormalizeService ทำความสะอาด 7 ขั้นตอน + 80+ คำนำหน้าไทย |
| ชื่อเดียวกันเขียนต่างกัน ("สยามคอนกรีต" vs "บริษัท สยาม คอนกรีต จำกัด") | Hybrid Alias จดจำชื่อแฝงทุกรูปแบบ + Fast Track O(1) |
| ข้อมูลเยอะเกินไป รันไม่ทัน (GAS จำกัด 6 นาที) | Checkpoint + Auto-Resume + Batch Operations |

### กลุ่มธุรกิจ 2 กลุ่ม

| กลุ่ม | ชื่อ | หน้าที่ | ไฟล์ |
|-------|------|--------|------|
| **กลุ่ม 1** (🟩) | Cleansing & Master DB | รับข้อมูลดิบ → ทำความสะอาด → จับคู่ → บันทึก | 05-10, 16, 20, 21 |
| **กลุ่ม 2** (🟦) | Daily Ops & Search | ดึงข้อมูล SCG API → ค้นหาพิกัด → ใส่ LatLong งานประจำวัน | 04, 11-13, 15, 17, 18 |

**กฎสำคัญ:** กลุ่ม 2 ห้ามเขียน Master Data โดยตรง — ต้องผ่าน Search Service เท่านั้น

---

## 2. สถาปัตยกรรมหลัก

### The Trinity Framework

ระบบ LMDS ใช้โครงสร้าง "Trinity" (3 เสาหลัก) ที่เชื่อมกันด้วยตาราง Intersection:

```
┌─────────────────────────────────────────────────┐
│                The Trinity Framework              │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ WHO      │  │ WHERE    │  │ WHERE        │   │
│  │ M_PERSON │  │ M_PLACE  │  │ M_GEO_POINT  │   │
│  │ (10 คอล) │  │ (14 คอล) │  │ (14 คอล)     │   │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │               │            │
│       └──────────────┼───────────────┘            │
│                      ▼                            │
│              ┌──────────────┐                     │
│              │ M_DESTINATION│ ← Intersection      │
│              │ (11 คอลัมน์)  │                     │
│              └──────────────┘                     │
│                                                    │
│  Person_ID + Place_ID + Geo_ID = 1 Destination    │
└─────────────────────────────────────────────────┘
```

**ความหมาย:** การจัดส่ง 1 ครั้ง ประกอบด้วย 3 เสา — ใคร (WHO) ส่งไปที่ไหนตามที่อยู่ (WHERE-Address) พิกัดอะไร (WHERE-Coordinate) โดยเชื่อมกันผ่านตาราง M_DESTINATION

### 6 ชั้นสถาปัตยกรรม (Layered Architecture)

| ชั้น | ชื่อ | ไฟล์หลัก | หน้าที่ |
|-----|------|---------|--------|
| A | Ingestion | 04_SourceRepository | อ่านข้อมูลดิบจาก SCG API หรือชีต |
| B | Normalization | 05_NormalizeService, 20_ThGeoService | ทำความสะอาดชื่อ/ที่อยู่ |
| C | Master Resolution | 06–09_PersonService/PlaceService/GeoService/DestinationService | จับคู่กับ Master |
| D | Hybrid Alias | 21_AliasService | จดจำชื่อแฝงข้ามโดเมน |
| E | Transaction & Review | 11_TransactionService, 12_ReviewService | บันทึกผล + รีวิว |
| F | Governance & Hardening | 19_Hardening, 03_SetupSheets, 13_ReportService | ตรวจสอบ + รายงาน |

---

## 3. โมดูลทั้ง 22 ไฟล์ — ทำอะไรบ้าง

### กลุ่ม 0: Core System (ระบบหลัก)

| ไฟล์ | หน้าที่หลัก | ฟังก์ชันสำคัญที่ต้องรู้ |
|------|------------|----------------------|
| **00_App.gs** | จุดเริ่มระบบ, เมนู, Pipeline orchestration | `onOpen()`, `onEdit()`, `runFullPipeline()`, `diagnoseSystemState()` |
| **01_Config.gs** | ค่าคงที่ทั้งระบบ (Single Source of Truth) | `SHEET`, `*_IDX`, `AI_CONFIG`, `SCG_CONFIG`, `validateConfig()` |
| **02_Schema.gs** | นิยาม Header ทุกชีต + Validation | `getSheetHeaders()`, `validateSheetHeaders()`, `getColIndex()` |
| **03_SetupSheets.gs** | สร้างชีตทั้งหมด + ระบบ Logging | `setupAllSheets()`, `logInfo()`, `logWarn()`, `logError()`, `logDebug()` |
| **14_Utils.gs** | ไลบรารีใช้ร่วม — String Similarity, GPS, AI, Cache, Stats | `diceCoefficient()`, `levenshteinDistance()`, `callGeminiAPI()`, `generateShortId()`, `normalizeInvoiceNo()`, `batchUpdateEntityStats_()`, `saveChunkedCache_()`, `loadChunkedCache_()` |

### กลุ่ม 1: Cleansing & Master DB (ขั้นตอนทำความสะอาด)

| ไฟล์ | หน้าที่หลัก | ฟังก์ชันสำคัญที่ต้องรู้ |
|------|------------|----------------------|
| **05_NormalizeService.gs** | ทำความสะอาดชื่อและที่อยู่ภาษาไทย | `normalizePersonNameFull()`, `normalizePlaceName()`, `buildThaiPhoneticKey()`, `normalizeForCompare()` |
| **06_PersonService.gs** | Person CRUD + 5-strategy Candidate Search | `resolvePerson()`, `findPersonCandidates()`, `scorePersonCandidate()`, `createPerson()`, `mergePersonRecords()` |
| **07_PlaceService.gs** | Place CRUD + 4-level Address Enrichment | `resolvePlace()`, `findPlaceCandidates()`, `getEnrichedGeoData()`, `tryMatchBranch()` |
| **08_GeoService.gs** | Geo CRUD + Grid-based Proximity + Tiered Spatial | `resolveGeo()`, `findGeoCandidates_()`, `haversineDistance()`, `createGeoPoint()`, `geoClassifyDistance_()` |
| **09_DestinationService.gs** | Destination CRUD + Trinity Intersection | `resolveDestination()`, `createDestination()`, `getDestsByPersonId()` |
| **10_MatchEngine.gs** | หัวใจ Pipeline: 8 Rules + Single Writer M_ALIAS | `runMatchEngine()`, `processOneRow()`, `makeMatchDecision()`, `executeDecision()`, `resolveAndPersist_()` (gateway, REF-001), `autoEnrichAliasesFromFactBatch_()` |
| **16_GeoDictionaryBuilder.gs** | สร้าง/จัดการพจนานุกรมภูมิศาสตร์ไทย | `buildGeoDictionary()`, `lookupByPostcode()`, `scanAddressAgainstDictionary()`, `stripThaiAdminPrefix_()` (REF-014), `stripThaiProvincePrefix_()` (REF-014) |
| **20_ThGeoService.gs** | สกัดภูมิศาสตร์ไทยจากที่อยู่ดิบ + Metadata | `extractGeoFromAddress()`, `populateGeoMetadata()`, `transformGeoMetadataRow_()` (REF-006), `flushGeoMetadataBatch_()` (REF-006) |
| **21_AliasService.gs** | Hybrid Alias — Fast Track, Global Alias, Migration | `fastLookupByShipToName()`, `resolveMasterUuidViaGlobalAlias()`, `createGlobalAlias()`, `MIGRATION_HybridAliasSystem()`, `assignMasterUuidIfMissing()` |

### กลุ่ม 2: Daily Ops & Search (งานประจำวัน)

| ไฟล์ | หน้าที่หลัก | ฟังก์ชันสำคัญที่ต้องรู้ |
|------|------------|----------------------|
| **04_SourceRepository.gs** | อ่าน/กรอง/สร้าง Object จากข้อมูลดิบ | `getAllSourceRows()`, `getUnprocessedRows()`, `updateSyncStatus_()` |
| **11_TransactionService.gs** | FACT_DELIVERY upsert (32-col array) | `upsertFactDelivery()`, `findFactRowByInvoice_()` |
| **12_ReviewService.gs** | Human-in-the-loop management (4 decisions) | `enqueueReview()`, `applyReviewDecision()`, `applyAllPendingDecisions()` |
| **13_ReportService.gs** | รายงานคุณภาพข้อมูล | `buildFullQualityReport()`, `highlightHighPriorityReviews()` |
| **15_GoogleMapsAPI.gs** | Geocoding + 3-layer Cache (RAM → Sheet → API) | `geocodeAddress()` (thin wrapper), `reverseGeocode()` (thin wrapper), `cachedGeoLookup_()` (3-layer cache, REF-016), `getRouteDistanceKm()` |
| **17_SearchService.gs** | สะพาน Group 2→1, 2-Tier Search (ShipToName-Only) | `findBestGeoByPersonPlace()`, `runLookupEnrichment()`, `lookupSingleRow()`, `lookupEnrichOneRow_()` (SRP extraction) |
| **18_ServiceSCG.gs** | ดึงข้อมูล SCG → ชีตรายวัน + Summaries | `fetchDataFromSCGJWD()`, `applyMasterCoordinatesToDailyJob()`, `buildOwnerSummary()` |

---

## 4. ชีตทั้ง 19 ตาราง — เก็บอะไรบ้าง

### 4.1 Master Data (ฐานข้อมูลหลัก — เสา Trinity)

| ชีต | คอลัมน์ | เก็บอะไร | ตัวแปร Index |
|-----|---------|---------|-------------|
| **M_PERSON** | 10 | ข้อมูลบุคคล — ชื่อมาตรฐาน, เบอร์โทร, UUID | `PERSON_IDX` |
| **M_PLACE** | 14 | ข้อมูลสถานที่ — ที่อยู่สมบูรณ์, จังหวัด/อำเภอ/ตำบล, UUID | `PLACE_IDX` |
| **M_GEO_POINT** | 14 | ข้อมูลพิกัด — LAT, LNG, รัศมี, ที่อยู่ที่แก้แล้ว | `GEO_IDX` |
| **M_DESTINATION** | 11 | ตาราง Intersection — Person_ID + Place_ID + Geo_ID | `DEST_IDX` |

### 4.2 Alias Tables (ระบบจดจำชื่อ)

| ชีต | คอลัมน์ | เก็บอะไร | ตัวแปร Index |
|-----|---------|---------|-------------|
| **M_PERSON_ALIAS** | 6 | ชื่อแฝงบุคคล — เชื่อมกับ person_id | `PERSON_ALIAS_IDX` |
| **M_PLACE_ALIAS** | 6 | ชื่อแฝงสถานที่ — เชื่อมกับ place_id | `PLACE_ALIAS_IDX` |
| **M_ALIAS** | 8 | Global Alias Ledger — เชื่อมกับ master_uuid | `ALIAS_IDX` |

### 4.3 Transaction Tables (ข้อมูลรายการ)

| ชีต | คอลัมน์ | เก็บอะไร | ตัวแปร Index |
|-----|---------|---------|-------------|
| **FACT_DELIVERY** | 32 | รายการจัดส่งที่ประมวลผลแล้ว — ผลการจับคู่, พิกัด, หลักฐาน | `FACT_IDX` |
| **Q_REVIEW** | 22 | คิวรอตรวจสอบ — เคสคลุมเครือที่รอมนุษย์ตัดสินใจ | `REVIEW_IDX` |

### 4.4 Source Sheet (ข้อมูลดิบ)

| ชีต | คอลัมน์ | เก็บอะไร | ตัวแปร Index |
|-----|---------|---------|-------------|
| **SCGนครหลวงJWDภูมิภาค** | 37 | ข้อมูลดิบจาก SCG API — ชื่อปลายทาง, ที่อยู่, พิกัด, SYNC_STATUS | `SRC_IDX` |
| **ตารางงานประจำวัน** | 29 | งานประจำวัน — ShipToName, ShipToAddress, พิกัด | `DATA_IDX` |

### 4.5 System Tables (ระบบ)

| ชีต | คอลัมน์ | เก็บอะไร |
|-----|---------|---------|
| **SYS_LOG** | 6 | ปูมบันทึกระบบ — auto-clean ที่ 5,000 แถว |
| **SYS_CONFIG** | 4 | ค่าตั้งค่า — เช่น GEMINI_API_KEY |
| **SYS_TH_GEO** | 16 | ฐานข้อมูลภูมิศาสตร์ไทย 7,537 รายการ |
| **ข้อมูลพนักงาน** | 8 | ข้อมูลพนักงานขับรถ |
| **Input** | 2 | Cookie + ShipmentNos สำหรับ SCG API |
| **สรุป_เจ้าของสินค้า** | 6 | สรุปจำนวนงานตามเจ้าของสินค้า |
| **สรุป_Shipment** | 7 | สรุปจำนวนงานตาม Shipment |
| **RPT_DATA_QUALITY** | 8 | รายงานคุณภาพข้อมูล |

---

## 5. คอลัมน์/ชีตเชื่อมกันยังไง (Data Relationships)

### 5.1 Foreign Key Relationships

```
M_PERSON.person_id ─────┐
                         ├──→ M_DESTINATION.person_id
M_PLACE.place_id ────────┤──→ M_DESTINATION.place_id
M_GEO_POINT.geo_id ──────┘──→ M_DESTINATION.geo_id

M_PERSON.master_uuid ──────→ M_ALIAS.master_uuid (entity_type=PERSON)
M_PLACE.master_uuid ───────→ M_ALIAS.master_uuid (entity_type=PLACE)

M_PERSON.person_id ────────→ M_PERSON_ALIAS.person_id
M_PLACE.place_id ──────────→ M_PLACE_ALIAS.place_id

FACT_DELIVERY.person_id ───→ M_PERSON.person_id
FACT_DELIVERY.place_id ────→ M_PLACE.place_id
FACT_DELIVERY.geo_id ──────→ M_GEO_POINT.geo_id
FACT_DELIVERY.dest_id ─────→ M_DESTINATION.dest_id

Q_REVIEW.cand_persons ────→ M_PERSON.person_id (JSON array)
Q_REVIEW.cand_places ─────→ M_PLACE.place_id (JSON array)
```

### 5.2 การไหลของข้อมูล (Data Flow)

```
SCG API → SCGนครหลวงJWDภูมิภาค (ข้อมูลดิบ)
              │
              ▼
     04_SourceRepository (อ่าน + กรอง SYNC_STATUS)
              │
              ▼
     05_NormalizeService (ทำความสะอาดชื่อ/ที่อยู่)
     20_ThGeoService (สกัดภูมิศาสตร์ไทย)
              │
              ▼
     10_MatchEngine (จับคู่กับ Master)
     ├── 06_PersonService (หา/สร้าง Person)
     ├── 07_PlaceService (หา/สร้าง Place)
     ├── 08_GeoService (หา/สร้าง Geo)
     ├── 09_DestinationService (สร้าง Intersection)
     ├── 21_AliasService (สร้าง Alias อัตโนมัติ)
     │
     ├──→ 11_TransactionService → FACT_DELIVERY (บันทึกผล)
     └──→ 12_ReviewService → Q_REVIEW (กรณีไม่แน่ใจ)
```

### 5.3 ID Format

| ประเภท | รูปแบบ | สร้างด้วย | ตัวอย่าง |
|--------|--------|----------|---------|
| Person ID | `PS` + random | `generateShortId('P')` | PS3k7x |
| Place ID | `PL` + random | `generateShortId('PL')` | PL8m2n |
| Geo ID | `GE` + random | `generateShortId('G')` | GE1a4b |
| Destination ID | `DS` + random | `generateShortId('D')` | DS9f0c |
| Transaction ID | `TX` + random | `generateShortId('TX')` | TX5h2k |
| Alias ID (Person) | `PA` + random | `generateShortId('A')` | PA2d6j |
| Alias ID (Place) | `PLA` + random | `generateShortId('A')` | PLA4c8p |
| Master UUID | UUID v4 | `Utilities.getUuid()` | a1b2c3d4-e5f6-7890-abcd-ef1234567890 |

---

## 6. Pipeline ทำงานยังไง (Step-by-Step)

### 6.1 Full Pipeline (กลุ่ม 1)

เรียกจากเมนู **🚀 Run Full Pipeline** หรือแยก Step ได้:

#### Step 1: โหลดข้อมูลดิบ (`runLoadSource` — 04_SourceRepository)
1. อ่านชีต SCGนครหลวงJWDภูมิภาค เฉพาะแถวที่ `SYNC_STATUS != SUCCESS`
2. สร้าง Source Object ต่อ Record ประกอบด้วย: invoiceNo, rawPersonName, rawPlaceName, rawAddress, lat, lng, deliveryDate ฯลฯ
3. กรอง Invoice ที่มีอยู่แล้วใน FACT_DELIVERY (Set-based lookup ป้องกัน duplicate)
4. แถวที่ Invoice ซ้ำ → auto-mark เป็น SUCCESS ทันที

#### Step 2: Normalize (`runNormalize` — 05_NormalizeService)
1. สกัดเลขรหัส (`\b[0-9]{8,}\b`) และเบอร์โทร (`+66..`) ออกจากชื่อ
2. ตัดคำนำหน้า 80+ คำ (คุณ, นาย, นาง, บจก., บริษัท ฯลฯ)
3. ขยะไม่ทิ้ง — ข้อมูลที่สกัดได้เก็บใน `deliveryNotes[]` → คอลัมน์ `NOTE`
4. สร้าง Phonetic Key (Thai consonants only, max 6 chars) สำหรับค้นหา
5. แกะภูมิศาสตร์ไทยด้วย `20_ThGeoService` → จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์

#### Step 3: Match Engine (`runMatchEngine` — 10_MatchEngine)
1. ส่งข้อมูลที่ normalize แล้วเข้า `processOneRow()` ทีละแถว
2. เรียก `resolvePerson()` → 5-strategy Candidate Search (M_ALIAS Fast Path → Phone → Alias → Phonetic → Note Search)
3. เรียก `resolvePlace()` → 4-strategy Candidate Search (M_ALIAS Fast Path → Alias → Phonetic → Note Search)
4. เรียก `resolveGeo()` → Grid-based Proximity + Tiered Spatial
5. เรียก `resolveDestination()` → Trinity Intersection
6. ส่งผลเข้า `makeMatchDecision()` → ใช้กฎ 8 ข้อ (ดูหัวข้อ 7)
7. บันทึกผลลง FACT_DELIVERY หรือ Q_REVIEW ตาม action
8. เรียก `autoEnrichAliasesFromFactBatch_()` — สร้าง Alias อัตโนมัติจาก FACT ผ่าน `resolveAndPersist_()` gateway (REF-001)

### 6.2 Pipeline กลุ่ม 2 (งานประจำวัน)

เรียกจากเมนู **📥 ดึงข้อมูล SCG API**:

1. `fetchDataFromSCGJWD()` — ดึงข้อมูลจาก SCG API → เขียนลงชีตตารางงานประจำวัน
2. `applyMasterCoordinatesToDailyJob()` → เรียก `runLookupEnrichment()`:
   - วนทุกแถวในชีตงานประจำวัน
   - เรียก `findBestGeoByPersonPlace()` → 2-Tier Search (ดูหัวข้อ 8)
   - ใส่พิกัด (LAT, LNG) ที่ได้ลงชีต + ระบายสีพื้นหลังตามความมั่นใจ
3. สร้าง Summary Tables (เจ้าของสินค้า, Shipment)

---

## 7. Match Engine — กฎ 8 ข้อที่ตัดสินใจจับคู่

`makeMatchDecision()` ใช้กฎ 8 ข้อเรียงตาม Priority:

| กฎ | ชื่อ | เงื่อนไข | Action | Priority |
|----|------|---------|--------|----------|
| 1 | **INVALID_LATLNG** | พิกัดจาก Source หาย (lat=0, lng=0 หรือว่าง) | `REVIEW_INVALID` (Confidence: 0) | CRITICAL |
| 2 | **LOW_QUALITY** | ข้อมูลคุณภาพต่ำ (ชื่อสั้นเกิน/ที่อยู่ไม่ครบ) | `REVIEW` | HIGH |
| 3 | **GEO_PROVINCE_CONFLICT** | จังหวัดจาก Geo ไม่ตรงกับจังหวัดจากที่อยู่ | `REVIEW` (Confidence: 50) | HIGH |
| 3.5 | **NEARBY_PENDING** | Tiered Spatial: ≤50m AutoMerge, 51-79m Yellow, 80-100m Orange, >100m ใหม่ | ตามระยะ | MEDIUM |
| 4 | **FULL_MATCH** | Person + Place + Geo ตรงทั้งหมด | `AUTO_MATCH` | — |
| 5 | **GEO_ANCHOR** | เจอ Geo เดิม + Person เดิม (Place อาจใหม่) | `AUTO_MATCH` | — |
| 6 | **FUZZY_MATCH** | Score ≥ THRESHOLD_AUTO (90) | `AUTO_MATCH` | — |
| 7 | **ALL_NEW_WITH_GEO** | ทุกอย่างใหม่ มีพิกัด | `CREATE_NEW` | — |
| 8 | **DEFAULT** | ไม่เข้าเงื่อนไขใดๆ | `REVIEW` | — |

### Scoring System

**Person Scoring:**
- Phone match = 95 คะแนน (ตรงเป๊ะ)
- ชื่อ ≥ 4 ตัวอักษร: Dice(0.5) + Levenshtein(0.3) + Ratio(0.2)
- ชื่อสั้น: Dice(0.6) + Levenshtein(0.4)

**Place Scoring:**
- Exact match = 100
- Dice(0.6) + Levenshtein(0.4)
- PLACE_SCORE_MIN = 55

### Thresholds

| ค่า | ความหมาย |
|-----|---------|
| THRESHOLD_AUTO = 90 | ≥ 90 → จับคู่อัตโนมัติ (AUTO_MATCH) |
| THRESHOLD_REVIEW = 70 | 70-89 → ส่งรีวิว (Q_REVIEW) |
| THRESHOLD_IGNORE = 50 | < 50 → ไม่พิจารณา candidate นั้น |

---

## 8. Search Service — 2-Tier ค้นหาพิกัด

`findBestGeoByPersonPlace()` ใน `17_SearchService.gs` ค้นหาพิกัดเป็น 2 ชั้น:

```
Tier 0: M_ALIAS Fast Track ─── O(1) lookup
    │  fastLookupByShipToName()
    │  ShipToName → normalize → M_ALIAS reverse index → masterUuid
    │  → entityId → dest → lat,lng
    │  (uses resolveAndPersist_ gateway — REF-001)
    │
    ▼ (ไม่เจอ)
Tier 1: resolvePerson Cascade ─── Person → Destinations → Best
    │  resolvePerson() → ค้นหา/จับคู่ Person จากชื่อ
    │  getDestsByPersonId() → ดึง Destination ทั้งหมดของ Person นั้น
    │  → เลือก Best Destination (ตามคะแนน/ระยะทาง)
    │  → คืน lat,lng ของ Destination ที่ดีที่สุด
    │
    ▼ (ไม่เจอ)
    คืนค่าว่าง — ต้องรอ Pipeline กลุ่ม 1 ประมวลผลก่อน
```

### ระบบสีพื้นหลัง (Visual Feedback)

| สี | ความหมาย | เงื่อนไข |
|----|---------|---------|
| 🟢 เขียว `#b6d7a8` | เจอพิกัดจาก Fast Track หรือ Tier 1 | FOUND_ALIAS_FAST / FOUND_DOMINANT |
| 🔴 แดง `#f4cccc` | ไม่พบพิกัด | NOT_FOUND — ยังไม่มีข้อมูลใน Master |

---

## 9. Hybrid Alias Architecture — ระบบจดจำชื่อ

### ภาพรวม

Hybrid Alias เป็นระบบจดจำชื่อแฝงแบบคู่ ที่รองรับทั้ง **Entity-specific Alias** (Local) และ **Global Alias Ledger** (Global) โดยมี `master_uuid` เป็นกุญแจเชื่อมโยง:

```
┌──────────────┐     ┌──────────────┐
│  M_PERSON    │     │  M_PLACE     │
│  master_uuid │     │  master_uuid │
└──────┬───────┘     └──────┬───────┘
       │                    │
┌──────▼───────┐     ┌──────▼───────┐
│M_PERSON_ALIAS│     │M_PLACE_ALIAS │  ← Entity-specific (Local)
└──────┬───────┘     └──────┬───────┘
       │                    │
       └────────┬───────────┘
                ▼
         ┌─────────────┐
         │   M_ALIAS    │  ← Global Alias Ledger
         │ master_uuid  │
         │ variant_name │
         │ entity_type  │
         │ confidence   │
         └─────────────┘
```

### กลไกหลัก

| กลไก | รายละเอียด |
|------|-----------|
| **Single Writer Pattern** | `autoEnrichAliasesFromFactBatch_()` ใน `10_MatchEngine.gs` เป็นจุดเขียน M_ALIAS จุดเดียวใน Pipeline อัตโนมัติ การเขียนจากที่อื่นต้องผ่าน `21_AliasService.gs` |
| **Runtime Fast-path** | `fastLookupByShipToName()` — ShipToName → M_ALIAS reverse index → masterUuid → entityId → dest → lat,lng (O(1)) |
| **Auto-Enrich** | หลัง Pipeline เสร็จ ระบบสร้าง Alias อัตโนมัติจาก FACT_DELIVERY: PERSON canonical (confidence 100), PERSON variant (95), PLACE canonical (100), PLACE variant (90) |
| **Dedup** | ใช้ Set-based dedup ป้องกันเขียนซ้ำ — โหลด Alias ที่มีอยู่ สร้างเป็น Set ก่อน แล้วตรวจสอบก่อนเขียน |

### ฟังก์ชันสำคัญใน 21_AliasService.gs

| ฟังก์ชัน | หน้าที่ |
|----------|--------|
| `createGlobalAlias()` | สร้าง alias ใน M_ALIAS + sync ไป entity table |
| `fastLookupByShipToName()` | ⚡ Fast Track — ShipToName → lat,lng (O(1)) |
| `resolveMasterUuidViaGlobalAlias()` | ค้นหา variant → ได้ masterUuid |
| `loadGlobalAliasReverseIndex_()` | โหลด reverse index {normalized: [{masterUuid, entityType}]} |
| `assignMasterUuidIfMissing()` | ตรวจและเพิ่ม UUID ให้ entity ที่ยังไม่มี |
| `MIGRATION_HybridAliasSystem()` | ย้ายข้อมูลจากเก่า → M_ALIAS (รันครั้งเดียว) |

---

## 10. Human-in-the-Loop — ระบบรีวิว

เมื่อ Match Engine ไม่แน่ใจ (Score 70-89) จะส่งข้อมูลเข้า **Q_REVIEW** รอมนุษย์ตัดสินใจ:

### Decision ที่เลือกได้

| Decision | ความหมาย | ผลลัพธ์ |
|----------|---------|---------|
| `CREATE_NEW` | สร้าง Master ใหม่ | สร้าง Person/Place/Geo/Destination ใหม่ |
| `MERGE_TO_CANDIDATE` | รวมเข้า Master ที่มีอยู่ | อัปเดต usage_count + last_seen ของ Candidate |
| `IGNORE` | ข้ามรายการนี้ | ไม่สร้างอะไร บันทึกใน FACT ว่า IGNORE |
| `ESCALATE` | ส่งต่อให้ผู้บริหาร | เปลี่ยน priority เป็น 1 (สูงสุด) |

### วิธีใช้

1. เปิดชีต **Q_REVIEW**
2. เลือก Decision ในคอลัมน์ **V (DECISION)** จาก Dropdown
3. ระบบจะประมวลผลทันทีผ่าน `onEdit()` trigger
4. สีพื้นหลังจะเปลี่ยนอัตโนมัติ:
   - เขียว `#d9ead3` = Done
   - แดง `#f4cccc` = P3 (สูง)
   - เหลือง `#fff2cc` = P2 (กลาง)

### Smart Navigation

ในชีต Q_REVIEW คลิกที่ Candidate ID (คอลัมน์ L-O) แล้วระบบจะถามว่า:
- **[YES]** กระโดดไปชีต Master (ดูข้อมูลหลัก)
- **[NO]** กระโดดไปชีต FACT_DELIVERY (ดูประวัติขนส่ง)
- **[CANCEL]** ยกเลิก

---

## 11. เมนูผู้ใช้ — กดอะไรได้บ้าง

เมนู **🚚 LMDS V5.5** ปรากฏที่แถบเมนูด้านบนของ Google Sheets:

### 🚀 เมนูหลัก (ด้านบนสุด)

| เมนู | ฟังก์ชัน | คำอธิบาย |
|------|----------|---------|
| 🚀 Run Full Pipeline | `runFullPipeline()` | รัน Step 1-3 ต่อเนื่อง |
| 📍 จับคู่พิกัดวันนี้ | `applyMasterCoordinatesToDailyJob()` | ค้นหาพิกัดให้ชีตงานประจำวัน |

### 🟩 กลุ่ม 1: ล้างข้อมูล & Master

| เมนู | ฟังก์ชัน | คำอธิบาย |
|------|----------|---------|
| ▶️ รัน Full Pipeline (ทั้งหมด) | `runFullPipeline()` | รัน Step 1-3 |
| Step 1 — โหลดข้อมูลดิบจากแหล่ง | `runLoadSource()` | อ่านข้อมูลจาก Source |
| Step 2 — Normalize ชื่อ/ที่อยู่ | `runNormalize()` | ทำความสะอาด |
| Step 3 — Match Engine | `runMatchEngine()` | จับคู่กับ Master |
| 📋 เปิด Review Queue | `openReviewQueue()` | กระโดดไป Q_REVIEW |
| ▶️ รันคำสั่งที่เลือกไว้ทั้งหมด | `applyAllPendingDecisions()` | Batch ประมวลผล Decision |
| 📊 รายงาน Data Quality | `buildFullQualityReport()` | สร้างรายงานคุณภาพ |

### 🟦 กลุ่ม 2: งานประจำวัน (SCG)

| เมนู | ฟังก์ชัน | คำอธิบาย |
|------|----------|---------|
| 📥 ดึงข้อมูล SCG API | `fetchDataFromSCGJWD()` | ดึงข้อมูลจาก SCG |
| 📍 จับคู่พิกัด | `applyMasterCoordinatesToDailyJob()` | ใส่พิกัดให้งานประจำวัน |
| 🗑️ ล้างข้อมูลทั้งหมด | `clearAllSCGSheets_UI()` | ลบข้อมูล SCG ทั้งหมด |

### 🔧 ระบบ & ตั้งค่า

| เมนู | ฟังก์ชัน | คำอธิบาย |
|------|----------|---------|
| ⚙️ ตั้งค่า API Key | `setupEnvironment()` | ใส่ Gemini API Key |
| 🏗️ สร้างชีตทั้งหมด | `setupAllSheets()` | สร้าง/ซ่อมแซมชีตทั้งหมด |
| 🌍 อัปเดตฐานข้อมูลภูมิศาสตร์ | `buildGeoDictionary()` | สร้างพจนานุกรม SYS_TH_GEO |
| 🛠️ เติมข้อมูลภูมิศาสตร์ 16 คอลัมน์ | `populateGeoMetadata()` | เพิ่ม metadata ให้ SYS_TH_GEO |
| 🔗 สร้าง Alias อัตโนมัติ | `generatePersonAliasesFromHistory()` | สร้าง Alias จาก FACT |
| 🔄 Migration: Hybrid Alias System | `MIGRATION_HybridAliasSystem()` | ย้ายข้อมูล Alias ระบบเก่า (รันครั้งเดียว) |
| 🔗 ตรวจสอบ Master UUID | `assignMasterUuidIfMissing()` | เพิ่ม UUID ให้ entity ที่ขาด |
| 📥 ดึงชื่อจาก SCG ดิบ → M_ALIAS | `populateAliasFromSCGRawData()` | นำเข้า Alias จาก SCG ดิบ |
| 🛡️ Preflight Audit | `runPreflightAudit()` | ตรวจสอบก่อนรัน |
| 🧹 Detect Duplicates | `detectDoubleProcessing()` | ตรวจข้อมูลซ้ำ |
| ✅ ตรวจสอบ System Integrity | `checkSystemIntegrity()` | ตรวจชีตครบไหม |
| 🔍 วินิจฉัย Pipeline | `diagnoseSystemState()` | วินิจฉัยปัญหา |
| 🔄 รีเซ็ตสถานะ SYNC | `resetSourceSyncStatus()` | ล้าง SYNC_STATUS เพื่อรันใหม่ |
| 🧹 ล้างความจำระบบ | `invalidateAllGlobalCaches()` | เคลียร์ RAM Cache |
| 📖 ดู Version Info | `showVersionInfo()` | แสดงเวอร์ชัน |
| 🚀 ติดตั้ง Smart Navigation | `installSmartNavTrigger()` | เปิดคลิกนำทางใน Q_REVIEW |
| 🔐 **ตั้งค่า SCG Cookie** | `setupScgCookie()` | เก็บ Cookie ใน Script Properties อย่างปลอดภัย (SEC-001, SEC-003) |
| 👥 **ตั้งค่ารายชื่อ Admin** | `setupAdminList()` | กำหนดผู้ใช้ที่มีสิทธิ์รัน Destructive Operation (SEC-002) |
| 🛡️ **ป้องกันข้อมูล Sensitive** | `setupProtectedRanges()` | ตั้งค่า Protected Ranges สำหรับชีตที่มี PII (SEC-005) |

---

## 12. การตั้งค่าระบบครั้งแรก (First-Time Setup)

ทำตามลำดับนี้เมื่อติดตั้งระบบครั้งแรก:

### Step 1: ตั้งค่า API Key
- เมนู → ⚙️ ตั้งค่า API Key
- ใส่ Gemini API Key (ขอจาก https://aistudio.google.com/app/apikey)
- ระบบจะตรวจรูปแบบให้ (ต้องขึ้นต้นด้วย "AIza" ยาว 39 ตัวอักษร)

### Step 2: สร้างชีตทั้งหมด
- เมนู → 🏗️ สร้างชีตทั้งหมด
- ระบบจะสร้างชีตทั้ง 19 ตารางพร้อมคอลัมน์ที่ถูกต้อง
- ถ้าชีตมีอยู่แล้ว → ตรวจและเพิ่มคอลัมน์ที่ขาด (Auto-Repair)

### Step 3: อัปเดตฐานข้อมูลภูมิศาสตร์
- เมนู → 🌍 อัปเดตฐานข้อมูลภูมิศาสตร์ (SYS_TH_GEO)
- ระบบจะสร้างพจนานุกรม 7,537 รายการ พร้อม metadata 16 คอลัมน์

### Step 4: ตั้งค่า SCG Cookie
- ไปที่ชีต Input
- ใส่ Cookie ที่เซลล์ B1
- ใส่ ShipmentNos ที่เซลล์ B3 (คั่นด้วย comma)

### Step 5: (ครั้งแรกเท่านั้น) Migration Hybrid Alias
- เมนู → 🔗 ตรวจสอบ Master UUID
- เมนู → 🔄 Migration: Hybrid Alias System
- เมนู → 📥 ดึงชื่อจาก SCG ดิบ → M_ALIAS

### Step 6: รัน Pipeline ครั้งแรก
- เมนู → 🚀 Run Full Pipeline
- ตรวจสอบผลใน M_PERSON, M_PLACE, M_GEO_POINT, FACT_DELIVERY

---

## 13. การดูแลระบบ (Maintenance)

### สิ่งที่ควรทำเป็นประจำ

| งาน | ความถี่ | วิธีทำ |
|------|---------|-------|
| ตรวจสอบ Q_REVIEW | ทุกวัน | เปิดชีต Q_REVIEW → เลือก Decision |
| ล้างความจำระบบ | เมื่อข้อมูลไม่อัปเดต | เมนู → 🧹 ล้างความจำระบบ |
| ตรวจสอบ SYS_LOG | สัปดาห์ละครั้ง | ดู ERROR ล่าสุดในชีต SYS_LOG |
| รัน Diagnostic | เมื่อมีปัญหา | เมนู → 🔍 วินิจฉัย Pipeline |
| อัปเดต Cookie SCG | เมื่อ Cookie หมดอายุ | แก้ที่ชีต Input เซลล์ B1 |

### การรีเซ็ตข้อมูล

| สิ่งที่ต้องการ | วิธีทำ |
|-------------|-------|
| รัน Pipeline ใหม่ทั้งหมด | เมนู → 🔄 รีเซ็ตสถานะ SYNC → รัน Pipeline |
| ลบข้อมูล SCG วันนี้ | เมนู → 🗑️ ล้างข้อมูลทั้งหมด (กลุ่ม 2) |
| ล้าง Cache เมื่อเห็นข้อมูลเก่า | เมนู → 🧹 ล้างความจำระบบ |

### การดูแล SYS_LOG
- ระบบ auto-clean ที่ 5,000 แถว ไม่ต้องลบเอง
- ถ้าอยากดู log เก่า → บันทึกออกก่อน แล้วค่อยลบ

### การจัดการความปลอดภัย (V5.5.004 → V5.5.017 SECURITY-POSTFIX, SEC-001→012)

ระบบ LMDS V5.5.004 (ปัจจุบัน V5.5.017) เพิ่มชั้นความปลอดภัย 12 ด้าน (SEC-001→012):

1. **Secret Management (SEC-001)** — Cookie และ API Key เก็บใน PropertiesService ไม่ใช่ Spreadsheet Cell
2. **Authorization Guard (SEC-002, deny-by-default)** — 13/13 Destructive Operations ต้องผ่าน `isAuthorizedUser_()` ก่อนดำเนินการ
3. **Data Minimization (SEC-004, SEC-010)** — ปกปิด PII ใน Log และ Audit Trail, ตั้ง Protected Ranges สำหรับ 8/19 Sensitive Sheets + Q_REVIEW range
4. **OAuth Least Privilege (SEC-008)** — OAuth scopes ลดจาก 10 → 6 (สิทธิ์ตามที่ใช้จริงเท่านั้น)
5. **RFC 6265 Cookie Regex (SEC-009)** — `sanitizeCookie_()` ใช้ RFC 6265 compliant regex
6. **fetchWithRetry_ Body Truncation (SEC-012)** — Truncate response body ใน log ป้องกัน leak

---

## 14. การแก้ปัญหาเบื้องต้น (Troubleshooting)

### ปัญหา: Pipeline รันแล้วชีต Master ว่าง

| สาเหตุที่เป็นไปได้ | วิธีแก้ |
|------------------|--------|
| SYNC_STATUS ทั้งหมดเป็น SUCCESS แล้ว | รีเซ็ต SYNC → รันใหม่ |
| ชีตขาดคอลัมน์ | รัน "สร้างชีตทั้งหมด" (Auto-Repair) |
| ข้อมูลดิบไม่มีพิกัด | ทุกแถวจะเข้า REVIEW → ตรวจคอลัมน์ LAT/LNG |
| Score ไม่ถึง 90 | ข้อมูลเข้า Q_REVIEW → ตรวจ Decision |

**วิธีวินิจฉัย:** เมนู → 🔍 วินิจฉัย Pipeline (Diagnostic) — ระบบจะบอกสาเหตุเลย

### ปัญหา: พิกัดไม่ถูกต้อง

| สาเหตุ | วิธีแก้ |
|-------|--------|
| ข้อมูลภูมิศาสตร์ผิด (เช่น จังหวัดเป็น "พระปิ่นเกล้า") | รัน "อัปเดตฐานข้อมูลภูมิศาสตร์" → Dictionary จะ Overwrite ค่าผิด |
| Plus Code (JF6F+MV) ทำให้ที่อยู่ว่าง | ระบบมี Fallback ดึงจาก M_PLACE แล้ว — ตรวจใน M_GEO_POINT |
| รหัสไปรษณีย์คาบเกี่ยวหลายพื้นที่ (เช่น 10600) | ระบบใช้ Text-Priority — เลือกตามข้อความในที่อยู่ ไม่ใช่แค่รหัสไปรษณีย์ |

### ปัญหา: ข้อมูลซ้ำซ้อนใน Master

| สาเหตุ | วิธีแก้ |
|-------|--------|
| มี Person ซ้ำกัน | ใช้ `mergePersonRecords()` ใน 06_PersonService |
| Alias ซ้ำ | ระบบมี Set-based dedup อยู่แล้ว — ตรวจ duplicate ด้วย "Detect Duplicates" |
| พิกัดใกล้กันเกินไป | Tiered Spatial: ≤50m → AutoMerge, 51-100m → รีวิว |

### ปัญหา: ระบบช้า / Timeout

| สาเหตุ | วิธีแก้ |
|-------|--------|
| ข้อมูลเยอะเกิน 6 นาที | ระบบมี Auto-Resume อยู่ — รอให้จบเอง |
| Cache เต็ม | เมนู → 🧹 ล้างความจำระบบ |
| การใช้ `setValue()` ในลูป | ตรวจโค้ด — ต้องใช้ `setValues()` แทน (กฎข้อ 4) |

---

## 15. คำศัพท์สำคัญ (Glossary)

| คำ | ความหมาย |
|----|---------|
| **Trinity** | สถาปัตยกรรม 3 เสา: WHO (Person) + WHERE-Address (Place) + WHERE-Coordinate (Geo) |
| **Destination** | ตาราง Intersection ที่เชื่อม 3 เสาเข้าด้วยกัน (Person_ID + Place_ID + Geo_ID) |
| **Alias** | ชื่อแฝง — ชื่อที่เขียนต่างกันแต่หมายถึง Entity เดียวกัน |
| **Hybrid Alias** | ระบบ Alias แบบคู่: Local (M_PERSON_ALIAS/M_PLACE_ALIAS) + Global (M_ALIAS) |
| **master_uuid** | UUID v4 ที่เป็นกุญแจเชื่อมโยง Entity เดียวกันข้ามโดเมน |
| **Fast Track** | การค้นหาแบบ O(1) ผ่าน M_ALIAS reverse index |
| **Match Engine** | หัวใจของระบบ — ใช้กฎ 8 ข้อตัดสินใจว่าจะจับคู่, สร้างใหม่, หรือส่งรีวิว |
| **Pipeline** | กระบวนการ 3 Step: Load Source → Normalize → Match Engine |
| **SYNC_STATUS** | สถานะการประมวลผลของแถวใน Source Sheet (SUCCESS = ประมวลผลแล้ว) |
| **Checkpoint** | จุดบันทึกสถานะสำหรับ Resume เมื่อ Script ใกล้ Timeout |
| **Time Guard** | กลไกตรวจเวลาทุก 100 แถว — ถ้าใกล้ 5 นาทีจะหยุดและตั้ง Trigger รันต่อ |
| **Tiered Spatial** | การจัดระดับระยะทางพิกัด: ≤50m AutoMerge, 51-79m Yellow, 80-100m Orange |
| **Human-in-the-Loop** | ระบบที่ส่งเคสคลุมเครือให้มนุษย์ตัดสินใจผ่าน Q_REVIEW |
| **Phonetic Key** | รหัสเสียงภาษาไทย — ตัวอักษรพยัญชนะอย่างเดียว สูงสุด 6 ตัว |
| **Deep Note Search** | ค้นหาเจาะลึกในคอลัมน์ NOTE — คำที่ถูกตัดออกจากชื่อ (เช่น เบอร์โทร, คำนำหน้า) |
| **SYS_TH_GEO** | ฐานข้อมูลภูมิศาสตร์ไทย 7,537 รายการ — Single Source of Truth สำหรับแกะที่อยู่ |
| **Single Writer Pattern** | กฎที่ M_ALIAS ถูกเขียนจาก `autoEnrichAliasesFromFactBatch_()` เท่านั้นใน Pipeline |
| **Batch Operations** | การอ่าน/เขียนข้อมูลแบบก้อน (getValues/setValues) แทนทีละแถว เพื่อประหยัด API calls |
| **resolveAndPersist_** | Gateway pattern (REF-001) — ตรวจสอบก่อนว่าข้อมูลมีอยู่แล้วหรือยัง ถ้าไม่มีจึงสร้างใหม่และบันทึก ลดการเขียนซ้ำใน Alias |
| **cachedGeoLookup_** | 3-layer cache pattern (REF-016) — RAM Cache → CacheService → Sheet → API สำหรับ Geocoding lookup |
| **stripThaiAdminPrefix_** | ตัดคำนำหน้าหน่วยการปกครองไทย (แขวง/ตำบล/เขต/อำเภอ) ออกจากข้อความ (REF-014) |
| **stripThaiProvincePrefix_** | ตัดคำนำหน้า "จังหวัด" ออกจากชื่อจังหวัด (REF-014) |

---

## 16. FIRST_AUDIT_REVIEW15 — ผลการตรวจสอบคุณภาพโค้ด (2026-06-12)

### 16.1 สรุปผลการตรวจสอบ
ระบบ LMDS V5.5 ผ่านการตรวจสอบคุณภาพโค้ดตามกฎเหล็ก 16 ข้อ พบว่ามี 5 ข้อที่ควรแก้ไข (SHOULD_FIX) และได้ดำเนินการแก้ไขครบทุกข้อแล้ว ส่งผลให้ Compliance เป็น 16/16 COMPLIANT (รวม Rule 16: Security-First Design)

### 16.2 สิ่งที่เปลี่ยนแปลง
- **Phantom Call กำจัดหมด:** ฟังก์ชัน `invalidateGlobalAliasCache_()` ที่เรียกแต่ไม่มีอยู่จริง → เปลี่ยนเป็น `CacheService.getScriptCache().removeAll()` โดยตรง
- **Hardcode Index 0 จุดคงเหลือ:** ทุก `r[1]`, `r[2]` ฯลฯ → เปลี่ยนเป็น `ALIAS_IDX.*`, `PERSON_ALIAS_IDX.*`, `PLACE_ALIAS_IDX.*`
- **LogError มี Stack Trace ครบ:** 8 จุดเพิ่ม `new Error()` เพื่อให้เห็นตำแหน่งที่ผิดพลาดใน SYS_LOG
- **Dead Code ลบแล้ว:** `extractTextPriority_()` + `fuzzyMatchAddress()` ออกจาก 07_PlaceService.gs
- **ตัวแปรเปลี่ยนชื่อ:** `d` → `districtName`/`parsedDate`/`district`, `r` → `aliasRow`, `e` → `i`
- **18 Helper Functions ใหม่:** แยกฟังก์ชันยาวเป็น helper สั้นตามหลัก SRP
- **Time Guard + Checkpoint:** เพิ่มใน `buildGeoDictionary()` และ `populateGeoMetadata()`

### 16.3 Critical Bug ที่พบและแก้ไขแล้ว
ระหว่างการตรวจสอบพบว่า `newRows.push(r)` ใน `flushGlobalAliasRows_()` ของ 19_Hardening.gs ใช้ตัวแปร `r` ซึ่งไม่มีอยู่ใน scope หลังจากเปลี่ยนชื่อ parameter จาก `r` เป็น `aliasRow` — แก้ไขเป็น `newRows.push(aliasRow)` ทันที

### 16.4 ผลกระทบต่อผู้ใช้
- **ไม่มีผลกระทบต่อการทำงาน:** ทุกการเปลี่ยนแปลงเป็น Refactoring เท่านั้น — Business Logic, Schema, และ Data Contract ไม่เปลี่ยนแปลง
- **ประสิทธิภาพดีขึ้น:** SRP helpers ทำให้โค้ดอ่านง่ายขึ้น แก้บั๊กได้เร็วขึ้น
- **ความปลอดภัยดีขึ้น:** logError มี stack trace ช่วยตามหาสาเหตุได้เร็วขึ้น

---

> **เอกสารนี้จัดทำโดย AI Assistant** | เวอร์ชัน: V5.5.017 | อัปเดตล่าสุด: 2026-06-21
