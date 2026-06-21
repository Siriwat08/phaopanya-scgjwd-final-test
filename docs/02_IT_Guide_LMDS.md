# คู่มือการติดตั้ง ตั้งค่าการใช้งาน แก้ไขปัญหา สำหรับทีม IT
## ระบบ LMDS (Logistics Master Data System) V5.5

---

## สารบัญ

1. [ภาพรวมสถาปัตยกรรมระบบ](#1-ภาพรวมสถาปัตยกรรมระบบ)
2. [การติดตั้งระบบ (Installation)](#2-การติดตั้งระบบ-installation)
3. [การตั้งค่าระบบ (Configuration)](#3-การตั้งค่าระบบ-configuration)
4. [โครงสร้างไฟล์และโมดูล](#4-โครงสร้างไฟล์และโมดูล)
5. [โครงสร้าง Schema และ Sheet](#5-โครงสร้าง-schema-และ-sheet)
6. [กฎสถาปัตยกรรมที่สำคัญ](#6-กฎสถาปัตยกรรมที่สำคัญ)
7. [การจัดการ Script Properties](#7-การจัดการ-script-properties)
8. [การจัดการ Trigger](#8-การจัดการ-trigger)
9. [การจัดการสิทธิ์และความปลอดภัย](#9-การจัดการสิทธิ์และความปลอดภัย)
10. [การ Backup และ Restore](#10-การ-backup-และ-restore)
11. [การแก้ไขปัญหา (Troubleshooting)](#11-การแก้ไขปัญหา-troubleshooting)
12. [การตรวจสอบระบบ (Monitoring)](#12-การตรวจสอบระบบ-monitoring)
13. [การย้ายระบบ (Migration)](#13-การย้ายระบบ-migration)
14. [ข้อจำกัดของ Google Apps Script](#14-ข้อจำกัดของ-google-apps-script)
15. [ภาคผนวก: รายการค่าคงที่สำคัญ](#15-ภาคผนวก-รายการค่าคงที่สำคัญ)

---

## 1. ภาพรวมสถาปัตยกรรมระบบ

### 1.1 สถาปัตยกรรม 3-Domain Group

```
┌──────────────────────────────────────────────────────────────┐
│                    00_App.gs (Menu Controller + Triggers)     │
│    onOpen → Menu | onEdit → Review Decision | onSelection    │
└──────────┬───────────────────────────────────┬───────────────┘
           │                                   │
    ┌──────▼──────┐                    ┌───────▼────────┐
    │  GROUP 0    │                    │   GROUP 1      │
    │  Core System│                    │   Master DB    │
    ├─────────────┤                    ├────────────────┤
    │ 01_Config   │◄───constants──────│ 05_Normalize   │
    │ 02_Schema   │◄───headers────────│ 06_Person      │
    │ 03_SetupSheets│◄──logging───────│ 07_Place       │
    │ 14_Utils    │◄───utilities──────│ 08_Geo         │
    │ 19_Hardening│◄───audit/protect──│ 09_Destination  │
    └─────────────┘                    │ 10_MatchEngine │
                                       │ 16_GeoDict     │
    ┌──────▼──────┐                    │ 20_ThGeo       │
    │  GROUP 2    │                    │ 21_Alias       │
    │  Daily Ops  │                    └────────────────┘
    ├─────────────┤                           │
    │ 04_Source   │◄───reads master───────────┘
    │ 11_Transact │
    │ 12_Review   │
    │ 13_Report   │
    │ 15_MapsAPI  │
    │ 17_Search   │
    │ 18_ServiceSCG│
    └─────────────┘
```

### 1.2 หลักการสำคัญ

| หลักการ | รายละเอียด |
|:---|:---|
| **Single Writer Pattern** | M_ALIAS ถูกเขียนโดย `autoEnrichAliasesFromFactBatch_()` ใน 10_MatchEngine เท่านั้น (auto pipeline) หรือ `createGlobalAlias()` ใน 21_AliasService (admin/migration) |
| **Trinity Framework** | Destination ที่สมบูรณ์ต้องมี Person + Place + Geo ครบทั้ง 3 FK |
| **Group 2 = Pure Consumer** | Group 2 อ่าน Master Data ได้อย่างเดียว ห้ามเขียน |
| **No Hardcode Index** | ใช้ `*_IDX` constants จาก 01_Config.gs เท่านั้น |
| **Safe Batching** | ใช้ getValues/setValues แบบ batch ห้ามใช้ getValue/setValue ใน loop |
| **Checkpoint & Resume** | ทุก pipeline ที่อาจเกิน 6 นาที ต้องมี Time Guard + Checkpoint |

### 1.3 Data Flow

```
SCG e-POD API
      │
      ▼
18_ServiceSCG.gs → ตารางงานประจำวัน (Daily Job Sheet)
      │
      ▼
17_SearchService.gs
  ├── Tier 0: M_ALIAS Fast Track → fastLookupByShipToName()
  ├── Tier 1: resolvePerson() → getDestsByPersonId()
  └── NOT_FOUND → คืน null (ไม่ใช้ข้อมูลที่ไม่น่าเชื่อถือ)
      │
      ▼
ค้นหาพิกัด → เขียน LatLong_Actual ลงตารางงานประจำวัน

── แยกจากด้านบน (Master Pipeline) ──

Sheet: SCGนครหลวงJWDภูมิภาค (Source)
      │
      ▼
04_SourceRepository.gs → โหลดแถวที่ยังไม่ประมวลผล
      │
      ▼
10_MatchEngine.gs → processOneRow()
  ├── 05_NormalizeService → ทำความสะอาดชื่อ/ที่อยู่
  ├── 06_PersonService → จับคู่/สร้าง Person
  ├── 07_PlaceService → จับคู่/สร้าง Place (+ Geo Extraction)
  ├── 08_GeoService → จับคู่/สร้าง Geo Point
  ├── 09_DestinationService → จับคู่/สร้าง Destination (Trinity)
  │
  ├── AUTO_MATCH (≥90) → 11_TransactionService → FACT_DELIVERY
  ├── CREATE_NEW → สร้าง Master ใหม่ → FACT_DELIVERY
  └── NEEDS_REVIEW (50-89) → 12_ReviewService → Q_REVIEW
      │
      ▼
autoEnrichAliasesFromFactBatch_() → M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS
```

---

## 2. การติดตั้งระบบ (Installation)

### 2.1 ข้อกำหนดเบื้องต้น

| รายการ | รายละเอียด |
|:---|:---|
| บัญชี Google | Google Workspace หรือ Gmail ที่มีสิทธิ์เพียงพอ |
| Google Sheets | Spreadsheet ว่างสำหรับ LMDS |
| SCG FSM API | สิทธิ์เข้าถึง SCG e-POD API |
| Google Maps API | Geocoding API + Directions API เปิดใช้งานแล้วใน Google Cloud Project |
| Gemini API Key | (Optional) สำหรับ AI Reasoning — **ปัจจุบันปิดใช้งานใน Production** |

### 2.2 ขั้นตอนการติดตั้ง

#### ขั้นที่ 1: สร้าง Google Spreadsheet

```
1. สร้าง Google Spreadsheet ใหม่
2. ตั้งชื่อ เช่น "LMDS Production V5.5"
3. บันทึก Spreadsheet ID จาก URL
   (https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit)
```

#### ขั้นที่ 2: ติดตั้ง Apps Script

```
1. เปิด Spreadsheet → Extensions → Apps Script
2. สร้างไฟล์ .gs ตามลำดับหมายเลข:
   - 00_App.gs
   - 01_Config.gs
   - 02_Schema.gs
   - 03_SetupSheets.gs
   - 04_SourceRepository.gs
   - 05_NormalizeService.gs
   - 06_PersonService.gs
   - 07_PlaceService.gs
   - 08_GeoService.gs
   - 09_DestinationService.gs
   - 10_MatchEngine.gs
   - 11_TransactionService.gs
   - 12_ReviewService.gs
   - 13_ReportService.gs
   - 14_Utils.gs
   - 15_GoogleMapsAPI.gs
   - 16_GeoDictionaryBuilder.gs
   - 17_SearchService.gs
   - 18_ServiceSCG.gs
   - 19_Hardening.gs
   - 20_ThGeoService.gs
   - 21_AliasService.gs
3. คัดลอกโค้ดจาก Repository ใส่แต่ละไฟล์
4. **สำคัญ:** ลบไฟล์ Code.gs เริ่มต้นที่ว่างเปล่า
```

#### ขั้นที่ 3: ตั้งค่า Script Properties

```
ไปที่ Apps Script → Project Settings (⚙️) → Script Properties

เพิ่ม Properties ดังนี้:
┌──────────────────────┬────────────────────────────────────────┐
│ Property             │ ค่าตัวอย่าง                            │
├──────────────────────┼────────────────────────────────────────┤
│ GEMINI_API_KEY       │ AIza... (หรือว่างไว้ถ้าไม่ใช้)           │
│ SCG_COOKIE           │ (ดึงจากเบราว์เซอร์ SCG e-POD)          │
│ ADMIN_EMAILS         │ user1@company.com,user2@company.com    │
│ MAPS_API_KEY         │ (หรือใช้ Built-in Geocoder)            │
└──────────────────────┴────────────────────────────────────────┘
```

#### ขั้นที่ 4: รัน Setup

```
1. ใน Apps Script Editor เลือกฟังก์ชัน setupAllSheets()
2. กด Run (▶️)
3. อนุมัติสิทธิ์ OAuth เมื่อระบบขอครั้งแรก
4. รอจนกระทั่งระบบสร้าง Sheet ทั้งหมดเสร็จ
5. กลับไป Spreadsheet ตรวจสอบว่ามี Sheet ครบ 20 แผ่น
```

#### ขั้นที่ 5: นำเข้าข้อมูลเริ่มต้น

```
1. นำเข้าข้อมูล SYS_TH_GEO (7,537 แถว) — ข้อมูลภูมิศาสตร์ไทย
   - ดึงจากแหล่งข้อมูล Thailand Postal Code
   - รัน populateGeoMetadata() เพื่อสร้างคอลัมน์ metadata
2. นำเข้าข้อมูลพนักงานใน Sheet ข้อมูลพนักงาน
3. นำเข้าข้อมูลดิบใน Sheet SCGนครหลวงJWDภูมิภาค
```

#### ขั้นที่ 6: ตรวจสอบระบบ

```
1. รีเฟรช Spreadsheet
2. ตรวจสอบเมนู 🚚 LMDS V5.5 ปรากฏ
3. รัน System Integrity Check
4. รัน Preflight Audit
5. ตรวจสอบ SYS_LOG ว่าไม่มี Error
```

---

## 3. การตั้งค่าระบบ (Configuration)

### 3.1 ค่า Configuration หลัก (01_Config.gs)

| กลุ่ม | ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|:---|:---|:---|:---|
| **Threshold** | AI_CONFIG.THRESHOLD_AUTO | 90 | คะแนนขั้นต่ำสำหรับ Auto Match |
| | AI_CONFIG.THRESHOLD_REVIEW | 70 | คะแนนขั้นต่ำที่ส่งเข้า Q_REVIEW |
| | AI_CONFIG.THRESHOLD_IGNORE | 50 | คะแนนต่ำกว่านี้จะถูกข้าม |
| **Geo** | AI_CONFIG.GEO_GRID_SIZE | 0.01 | ขนาด Grid สำหรับค้นหา Geo (~1.1 กม.) |
| | AI_CONFIG.GEO_RADIUS_M | 50 | รัศมีที่ถือว่า Geo ตรง (เมตร) |
| **Timeout** | AI_CONFIG.TIME_LIMIT_MS | 300000 | Time Guard = 5 นาที (GAS จำกัด 6 นาที) |
| **SCG API** | SCG_CONFIG.API_URL | (URL) | SCG FSM API Endpoint |
| | SCG_CONFIG.EPOD_OWNERS | [...] | รายชื่อเจ้าของสินค้า |

### 3.2 การปรับค่า Threshold

**คำเตือน:** การปรับ Threshold มีผลโดยตรงต่อความแม่นยำของระบบ

| การปรับ | ผลกระทบ |
|:---|:---|
| ลด THRESHOLD_AUTO (เช่น 80) | Auto Match เพิ่มขึ้น แต่อาจจับคู่ผิดมากขึ้น |
| เพิ่ม THRESHOLD_AUTO (เช่น 95) | Auto Match ลดลง แต่ความแม่นยำสูงขึ้น Q_REVIEW เพิ่ม |
| ลด THRESHOLD_IGNORE (เช่น 30) | ระบบพยายามจับคู่ข้อมูลที่คลุมเครือมากขึ้น |

### 3.3 การตั้งค่า SYS_CONFIG Sheet

| config_key | ค่าตัวอย่าง | คำอธิบาย |
|:---|:---|:---|
| LAST_PIPELINE_RUN | 2025-01-15T10:30:00 | เวลา Pipeline ล่าสุด |
| GEO_DICT_BUILT | true | สถานะการสร้าง Geo Dictionary |
| SCHEMA_VERSION | 5.5.020 | เวอร์ชัน Schema ปัจจุบัน |

---

## 4. โครงสร้างไฟล์และโมดูล

### 4.1 ไฟล์ทั้ง 22 ไฟล์

| # | ไฟล์ | กลุ่ม | หน้าที่หลัก | ฟังก์ชันสาธารณะสำคัญ |
|:---:|:---|:---|:---|:---|
| 1 | 00_App.gs | Core | Menu + Trigger | onOpen, runFullPipeline, checkSystemIntegrity, onSelectionChange, onEdit |
| 2 | 01_Config.gs | Core | Constants + Config | validateConfig, invalidateAllGlobalCaches, getGeminiApiKey |
| 3 | 02_Schema.gs | Core | Schema Headers | getSheetHeaders, validateSheetHeaders, validateSchemaConsistency |
| 4 | 03_SetupSheets.gs | Core | Setup + Logger | setupAllSheets, logInfo/Warn/Error/Debug, flushLogBuffer_ |
| 5 | 04_SourceRepository.gs | Daily | Source Data | runLoadSource, getAllSourceRows, getUnprocessedRows, invalidateSourceCache |
| 6 | 05_NormalizeService.gs | Master | Normalization | normalizePersonNameFull, normalizePlaceName, buildThaiPhoneticKey, normalizeForCompare |
| 7 | 06_PersonService.gs | Master | Person CRUD | resolvePerson, findPersonCandidates, scorePersonCandidate, createPerson, mergePersonRecords |
| 8 | 07_PlaceService.gs | Master | Place CRUD | resolvePlace, getEnrichedGeoData, createPlace, extractProvince_ |
| 9 | 08_GeoService.gs | Master | Geo CRUD | resolveGeo, createGeoPoint, findNearbyGeos, loadAllGeos_ |
| 10 | 09_DestinationService.gs | Master | Dest CRUD | resolveDestination, createDestination, getDestsByPersonId |
| 11 | 10_MatchEngine.gs | Master | **Match Engine** | runMatchEngine, processOneRow, makeMatchDecision, executeDecision, resolveAndPersist_, autoEnrichAliasesFromFactBatch_ |
| 12 | 11_TransactionService.gs | Daily | FACT_DELIVERY | upsertFactDelivery, invalidateFactInvoiceCache_ |
| 13 | 12_ReviewService.gs | Daily | Q_REVIEW | applyReviewDecision, applyAllPendingDecisions, getReviewStats |
| 14 | 13_ReportService.gs | Daily | Reports | buildFullQualityReport |
| 15 | 14_Utils.gs | Core | Utilities | levenshteinDistance, diceCoefficient, haversineDistanceM, generateShortId, callGeminiAPI, normalizeInvoiceNo, callSpreadsheetWithRetry, batchUpdateEntityStats_, saveChunkedCache_/loadChunkedCache_, isAuthorizedUser_ |
| 16 | 15_GoogleMapsAPI.gs | Daily | Maps API | geocodeAddress, reverseGeocode, cachedGeoLookup_, getRouteDistanceKm, clearMapsCache |
| 17 | 16_GeoDictionaryBuilder.gs | Master | Geo Dict | buildGeoDictionary, lookupByPostcode, lookupPostcodeByArea, scanAddressAgainstDictionary, stripThaiAdminPrefix_ |
| 18 | 17_SearchService.gs | Daily | Search | findBestGeoByPersonPlace, runLookupEnrichment |
| 19 | 18_ServiceSCG.gs | Daily | SCG API | fetchDataFromSCGJWD, applyMasterCoordinatesToDailyJob, buildOwnerSummary, buildShipmentSummary |
| 20 | 19_Hardening.gs | Core | Hardening | runPreflightAudit, detectDoubleProcessing, generatePersonAliasesFromHistory, applySheetProtection_UI |
| 21 | 20_ThGeoService.gs | Master | Thai Geo | extractGeoFromAddress, populateGeoMetadata, transformGeoMetadataRow_ |
| 22 | 21_AliasService.gs | Master | Alias Mgmt | resolveMasterUuidViaGlobalAlias, fastLookupByShipToName, createGlobalAlias, assignMasterUuidIfMissing, MIGRATION_HybridAliasSystem |

### 4.2 Dependency Map (การพึ่งพาระหว่างโมดูล)

```
10_MatchEngine ← {04, 05, 06, 07, 08, 09, 11, 12, 14, 15, 16, 21}
17_SearchService ← {01, 02, 05, 06, 09, 14, 21}
18_ServiceSCG ← {01, 02, 05, 14, 17, 21}
07_PlaceService ← {01, 02, 05, 08, 14, 15, 16, 20, 21}
06_PersonService ← {01, 02, 03, 05, 14, 21}
21_AliasService ← {01, 02, 05, 06, 07, 09, 14}
08_GeoService ← {01, 02, 07, 14, 15}
12_ReviewService ← {01, 02, 06, 07, 08, 09, 11, 14, 15}
19_Hardening ← {01, 02, 05, 06, 07, 08, 09, 11, 14}
01_Config ← (ไม่พึ่งพาใคร — รากฐาน)
05_Normalize ← (ไม่พึ่งพาใคร — Pure Computation)
14_Utils ← {01}
```

---

## 5. โครงสร้าง Schema และ Sheet

### 5.1 รายละเอียดคอลัมน์สำคัญ

#### M_PERSON (10 คอลัมน์)

| Index | ชื่อคอลัมน์ | ประเภท | คำอธิบาย |
|:---:|:---|:---|:---|
| 0 | person_id | String (P + 12 hex) | Primary Key — เช่น PA3F7B2C9D0E1 |
| 1 | canonical_name | String | ชื่อมาตรฐาน |
| 2 | normalized_name | String | ชื่อที่ Normalize แล้ว |
| 3 | phone | String | เบอร์โทรศัพท์ |
| 4 | is_company | Boolean | บริษัทหรือบุคคล |
| 5 | status | String | Active/Inactive/Merged |
| 6 | last_seen | Date | วันที่พบล่าสุด |
| 7 | usage_count | Integer | จำนวนครั้งที่ใช้ |
| 8 | notes | String | หมายเหตุ |
| 9 | master_uuid | String | UUID สำหรับ Alias System |

#### M_ALIAS (8 คอลัมน์) — Hybrid Architecture

| Index | ชื่อคอลัมน์ | ประเภท | คำอธิบาย |
|:---:|:---|:---|:---|
| 0 | alias_id | String (A + 12 hex) | Primary Key — เช่น AA3F7B2C9D0E1 |
| 1 | master_uuid | String | FK → M_PERSON.master_uuid หรือ M_PLACE.master_uuid |
| 2 | variant_name | String | ชื่อแฝง (ตัวสะกดผิด, ชื่อย่อ) |
| 3 | entity_type | String | PERSON / PLACE |
| 4 | confidence | Number | คะแนนความมั่นใจ |
| 5 | source | String | แหล่งที่มา (FACT_DELIVERY / MANUAL / MIGRATION) |
| 6 | created_at | Date | วันที่สร้าง |
| 7 | last_used | Date | วันที่ใช้ล่าสุด |

#### FACT_DELIVERY (32 คอลัมน์)

| Index | ชื่อคอลัมน์ | คำอธิบาย |
|:---:|:---|:---|
| 0 | tx_id | Transaction ID (TX + 12 hex) — เช่น TXA3F7B2C9D0E1 |
| 1 | invoice_no | เลข Invoice |
| 2 | shipment_no | เลข Shipment |
| 3 | person_id | FK → M_PERSON |
| 4 | place_id | FK → M_PLACE |
| 5 | geo_id | FK → M_GEO_POINT |
| 6 | dest_id | FK → M_DESTINATION |
| 7-10 | lat, lng, resolved_lat, resolved_lng | พิกัด GPS |
| 11 | match_status | AUTO_MATCH / CREATE_NEW / NEEDS_REVIEW |
| 12 | match_confidence | คะแนน (0-100) |
| 13 | match_evidence | รายละเอียดการจับคู่ |
| 14 | match_rule | กฎที่ใช้ (Rule 1-8) |
| 15-31 | (ข้อมูลดิบเพิ่มเติม) | ข้อมูลต้นทาง |

#### Q_REVIEW (22 คอลัมน์)

| Index | ชื่อคอลัมน์ | คำอธิบาย |
|:---:|:---|:---|
| 0 | review_id | Review ID |
| 1 | invoice_no | เลข Invoice ที่เกี่ยวข้อง |
| 2 | issue_type | ประเภทปัญหา |
| 3 | priority | HIGH / MEDIUM / LOW |
| 4 | status | PENDING / IN_REVIEW / DONE / ESCALATED |
| 5 | decision | CREATE_NEW / MERGE_TO_CANDIDATE / ESCALATE / IGNORE |
| 6-10 | raw_person, raw_place, candidate_person, candidate_place | ข้อมูลเปรียบเทียบ |
| 11 | match_score | คะแนนจับคู่ |
| 12-21 | (metadata เพิ่มเติม) | เวลา, ผู้ตรวจ, ฯลฯ |

---

## 6. กฎสถาปัตยกรรมที่สำคัญ

### 6.1 กฎ 15+1 ข้อที่ต้องปฏิบัติตาม

| # | กฎ | รายละเอียด | การทดสอบ |
|:---:|:---|:---|:---|
| 1 | Clean Code | camelCase, ชื่อที่มีความหมาย, ฟังก์ชัน <30 บรรทัด | Code Review |
| 2 | Single Responsibility | 1 ฟังก์ชัน = 1 หน้าที่ | Code Review |
| 3 | No Hardcode Index | ใช้ `*_IDX` constants เท่านั้น | validateConfig() |
| 4 | Safe Batching | getValues/setValues แบบ array ห้าม loop getValue/setValue | Performance Audit |
| 5 | Resumable State | Time Guard + Checkpoint สำหรับ pipeline ยาว | Timeout Test |
| 6 | Use Dependency Map | คอมเมนต์ด้านบนไฟล์ระบุ dependencies | File Header Audit |
| 7 | Zero Hallucination | ห้ามเรียกฟังก์ชันที่ไม่มีอยู่จริง | BUGHUNT Scan |
| 8 | Namespace Collision | ใช้ Object Namespace หรือ prefix สำหรับฟังก์ชันสาธารณะ | Name Audit |
| 9 | No Cross-File Global | ใช้ CONFIG หรือ CacheService แทนตัวแปร global | Static Analysis |
| 10 | Library Versioning | Lock version ห้ามใช้ HEAD | Manifest Check |
| 11 | HTML Service Include | แยก .html สำหรับ UI | File Structure |
| 12 | Error Handling | try-catch + logError ทุก entry point | Error Path Test |
| 13 | Logging | stack trace พร้อม file & line | Log Audit |
| 14 | Structured File Naming | XX_Component.gs | File List Check |
| 15 | Full Version Only | ห้ามตัดทอนโค้ดด้วย ... | File Completeness |
| 16 | Security-First | Secrets in PropertiesService, AuthZ guards, PII masking, API keys in headers, protected ranges | Security Audit |

### 6.2 Single Writer Pattern — สำคัญมาก!

```
┌─────────────────────────────────────────────────┐
│              M_ALIAS (Single Writer)             │
├─────────────────────────────────────────────────┤
│                                                  │
│  Auto Pipeline Writer:                           │
│  → autoEnrichAliasesFromFactBatch_()             │
│    (ใน 10_MatchEngine.gs)                        │
│                                                  │
│  Admin/Migration Writer:                         │
│  → createGlobalAlias()                           │
│    (ใน 21_AliasService.gs)                       │
│                                                  │
│  ⚠️ ห้ามเขียน M_ALIAS จากที่อื่น!                 │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 7. การจัดการ Script Properties

### 7.1 รายการ Properties ที่จำเป็น

| Property | หน้าที่ | วิธีตั้งค่า |
|:---|:---|:---|
| GEMINI_API_KEY | AI Reasoning (ปิดใช้งานใน Prod) | เมนู Set Gemini API Key หรือ Project Settings |
| SCG_COOKIE | SCG API Authentication | เมนู Set SCG Cookie หรือ Project Settings |
| ADMIN_EMAILS | รายชื่อผู้มีสิทธิ์ Admin (คั่นด้วย ,) | Project Settings เท่านั้น |

### 7.2 การตั้งค่าผ่าน Apps Script

```javascript
// ตั้งค่า Admin Emails
PropertiesService.getScriptProperties()
  .setProperty('ADMIN_EMAILS', 'user1@company.com,user2@company.com');

// อ่านค่า
var admins = PropertiesService.getScriptProperties()
  .getProperty('ADMIN_EMAILS');
```

### 7.3 การรักษาความปลอดภัยของ Properties

- **ห้าม**เก็บ Secrets ในเซลล์ Spreadsheet (SEC-001 Fix)
- **ห้าม** hardcode API keys ในโค้ด
- ใช้ PropertiesService.getScriptProperties() เท่านั้น
- Cookie ถูก sanitize ด้วย `sanitizeCookie_()` เพื่อป้องกัน CRLF Injection (SEC-003 Fix)

---

## 8. การจัดการ Trigger

### 8.1 Triggers ที่ระบบสร้าง

| ประเภท | ฟังก์ชัน | วัตถุประสงค์ | การสร้าง |
|:---|:---|:---|:---|
| onOpen | onOpen() | สร้างเมนูอัตโนมัติ | Auto (Simple Trigger) |
| onEdit | onEdit(e) | จับ Review Decision | Auto (Simple Trigger) |
| onSelectionChange | onSelectionChange(e) | Smart Navigation | Auto (Simple Trigger) |
| Time-based | (auto-resume) | Resume Pipeline หลัง timeout | สร้างโดย installAutoResume_() |

### 8.2 การตรวจสอบ Trigger

```
1. เปิด Apps Script Editor
2. ไปที่ Triggers (⏰) ที่แถบซ้าย
3. ตรวจสอบว่ามี Trigger ที่ค้างอยู่หรือไม่
4. หากมี Trigger ที่ไม่ควรมี (จาก Pipeline ที่เสร็จแล้ว) ให้ลบ
```

### 8.3 การล้าง Auto-Resume Triggers

```javascript
// รันใน Apps Script Editor
function cleanAllAutoResumeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction().indexOf('autoResume') !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
}
```

---

## 9. การจัดการสิทธิ์และความปลอดภัย

### 9.1 สิทธิ์การเข้าถึง Spreadsheet

| ระดับ | สิทธิ์ | บทบาท |
|:---|:---|:---|
| Editor | แก้ไขข้อมูล + ใช้เมนู | ADMIN |
| Viewer | ดูข้อมูลอย่างเดียว | ผู้บริหาร |

### 9.2 การป้องกัน Sheet (Protected Ranges — V5.5.020 expanded to 8 sheets + Q_REVIEW range)

ฟังก์ชัน `applySheetProtection_UI()` จะ (V5.5.020 SECURITY-POSTFIX: ขยายจาก 4 → 8 sheets):
- ล็อก Sheet (8 sheets): ข้อมูลพนักงาน, M_PERSON, SCGนครหลวงJWDภูมิภาค, M_GEO_POINT, M_PLACE, M_DESTINATION, M_ALIAS, FACT_DELIVERY
- ล็อก Q_REVIEW range (reviewer email + decision columns) — ป้องกัน tamper
- ซ่อน Sheet ที่มีข้อมูลสำคัญ (Input, SYS_CONFIG) — *MAPS_CACHE ถูกลบใน V5.5.013; FACT_DELIVERY +2 cols ใน V5.5.014 DRIVER-VERIFIED*
- ตั้งค่าให้เฉพาะ Admin เท่านั้นที่แก้ไขได้ (Sheet Protection Coverage: 8/19 sheets + Q_REVIEW range)

### 9.3 การ Audit ด้านความปลอดภัย (12 จุดที่แก้ไขแล้ว — SEC-001→012, V5.5.020 SECURITY-POSTFIX)

| SEC ID | ช่องโหว่ | การแก้ไข | วิธีตรวจสอบ |
|:---|:---|:---|:---|
| SEC-001 | Cookie อยู่ในเซลล์ Spreadsheet | ย้ายไป ScriptProperties (revisit V5.5.020) | ตรวจ Sheet Input ต้องไม่มี Cookie |
| SEC-002 | ไม่มี Authorization Guard (deny-by-default) | เพิ่ม `isAuthorizedUser_()` ครอบ 13/13 destructive ops (revisit V5.5.020) | ทดสอบกับอีเมลที่ไม่ใช่ Admin |
| SEC-003 | Cookie ไม่ถูก Sanitize | เพิ่ม `sanitizeCookie_()` ป้องกัน CRLF | ทดสอบใส่ Cookie ที่มี \r\n |
| SEC-004 | PII ปรากฏใน Log | ลบ response preview จาก SYS_LOG + ขยาย masking (revisit V5.5.020) | ตรวจ SYS_LOG ต้องไม่มีข้อมูลส่วนบุคคล |
| SEC-005 | ไม่มี Protected Ranges | เพิ่ม `applySheetProtection_UI()` | รันแล้วลองแก้ไข Sheet ที่ล็อก |
| SEC-006 | API Key อยู่ใน URL | เปลี่ยนเป็น x-goog-api-key header | ตรวจ Network Request |
| SEC-007 | Reviewer Email ไม่ถูก Mask | เพิ่ม `maskReviewerEmail_()` (revisit V5.5.020) | ตรวจ Q_REVIEW ต้องแสดง s***i@company.com |
| SEC-008 | OAuth scopes กว้างเกินไป (Least Privilege) | ลด OAuth scopes จาก 10 → 6 ตามที่ใช้จริง | ตรวจ appsscript.json manifest |
| SEC-009 | Cookie regex ไม่ RFC 6265 compliant | `sanitizeCookie_()` ใช้ RFC 6265 compliant regex | ทดสอบ Cookie format หลากหลาย |
| SEC-010 | PII Masking ไม่ครบ | ขยาย PII masking ใน log + audit trail ทุกจุด | ตรวจ log ต้องไม่มี PII |
| SEC-011 | Sheet Protection ไม่ครบ | ขยายจาก 4 → 8 sheets + Q_REVIEW range | รัน `applySheetProtection_UI()` แล้วตรวจ 8 sheets |
| SEC-012 | fetchWithRetry_ body leak ใน log | Truncate response body ใน `fetchWithRetry_` ก่อน log | ตรวจ log ต้องไม่มี full response body |

**OAuth Scopes:** 10 → 6 (Least Privilege, SEC-008)
**isAuthorizedUser_ Coverage:** 13/13 destructive ops (deny-by-default, SEC-002)
**Sheet Protection Coverage:** 8/19 sheets + Q_REVIEW range (SEC-011)

---

## 10. การ Backup และ Restore

### 10.1 การสำรองข้อมูล (Backup)

**วิธีที่ 1: Duplicate Spreadsheet (แนะนำ)**

```
1. เปิด LMDS Spreadsheet
2. File → Make a copy
3. ตั้งชื่อ เช่น "LMDS Backup 2025-01-15"
4. เลือก "Copy comments" และ "Copy data"
5. กด Make a copy
```

**วิธีที่ 2: Export ข้อมูลสำคัญ**

```javascript
// รันใน Apps Script Editor — Export ข้อมูลสำคัญเป็น JSON
function exportCriticalData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ['M_PERSON', 'M_PLACE', 'M_GEO_POINT', 'M_DESTINATION', 
                'M_ALIAS', 'FACT_DELIVERY', 'SYS_TH_GEO'];
  var export = {};
  sheets.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      export[name] = sheet.getDataRange().getValues();
    }
  });
  Logger.log(JSON.stringify(export).length + ' chars exported');
  // บันทึกลงไฟล์หรือ Properties
}
```

### 10.2 การกู้คืนข้อมูล (Restore)

```
1. เปิด Backup Spreadsheet
2. คัดลอกข้อมูลจาก Sheet ที่ต้องการกู้คืน
3. วางใน Production Spreadsheet
4. รัน invalidateAllGlobalCaches() เพื่อล้างแคช
5. รัน System Integrity Check เพื่อตรวจสอบ
```

### 10.3 กำหนดการ Backup

| ข้อมูล | ความถี่ | วิธี |
|:---|:---|:---|
| Spreadsheet ทั้งหมด | รายสัปดาห์ | Make a copy |
| Master Data (M_*) | ก่อนรัน Pipeline ใหญ่ | Export JSON |
| FACT_DELIVERY | รายเดือน | Export JSON |

---

## 11. การแก้ไขปัญหา (Troubleshooting)

### 11.1 ปัญหาที่พบบ่อย

#### T-001: Script Timeout (เกิน 6 นาที)

**อาการ:** Pipeline หยุดทำงานกลางคัน แจ้ง "Exceeded maximum execution time"

**สาเหตุ:** Google Apps Script จำกัดเวลาทำงาน 6 นาทีต่อ 1 ครั้งรัน

**วิธีแก้:**

```
1. ตรวจสอบว่าระบบติดตั้ง Auto-Resume Trigger แล้ว
   - รัน installAutoResume_() ใน Apps Script Editor
2. หาก Auto-Resume ไม่ทำงาน:
   - รัน removeAutoResume_() เพื่อลบ trigger เก่า
   - รัน Pipeline ซ้ำ — ระบบจะข้ามแถวที่ประมวลผลแล้ว (Checkpoint)
3. ตรวจสอบจำนวนข้อมูล:
   - หากมากกว่า 500 แถว แนะนำแบ่ง batch
4. ตรวจสอบ Time Guard:
   - AI_CONFIG.TIME_LIMIT_MS = 300000 (5 นาที)
   - ห้ามตั้งเกิน 360000 (6 นาที)
```

#### T-002: Cache ไม่อัปเดต

**อาการ:** ข้อมูลที่เพิ่มใหม่ไม่ปรากฏในการค้นหา

**สาเหตุ:** RAM Cache หรือ CacheService ยังเก็บข้อมูลเก่า

**วิธีแก้:**

```javascript
// รันใน Apps Script Editor
function forceClearAllCaches() {
  // 1. ล้าง RAM Cache
  invalidateAllGlobalCaches();
  
  // 2. ล้าง CacheService
  var cache = CacheService.getScriptCache();
  cache.removeAll(['SOURCE_ROWS', 'GEO_DICT_ROWS', 'GEO_DICT_MAP', 
                   'GEO_DICT_PROVINCES', 'GEO_DICT_DISTRICTS',
                   'ALL_PERSONS', 'ALL_PLACES', 'ALL_GEOS',
                   'ALL_DESTINATIONS', 'ALL_FACTS', 'ALIAS_MAP']);
  
  // 3. ล้าง Maps Cache (หากจำเป็น)
  clearMapsCache();
  
  Logger.log('All caches cleared');
}
```

#### T-003: ข้อมูลซ้ำใน FACT_DELIVERY

**อาการ:** พบ invoice_no ซ้ำใน FACT_DELIVERY

**วิธีแก้:**

```javascript
// รันใน Apps Script Editor
function handleDoubleProcessing() {
  var result = detectDoubleProcessing();
  Logger.log(result);
  // หากพบข้อมูลซ้ำ ให้ลบแถวที่ซ้ำด้วยตนเอง
  // คงไว้เฉพาะแถวที่ถูกต้อง (match_confidence สูงกว่า)
}
```

#### T-004: SCG API ตอบกลับผิดพลาด

**อาการ:** fetchDataFromSCGJWD() ล้มเหลว

**วิธีแก้:**

```
1. ตรวจสอบ Cookie:
   - Cookie หมดอายุหรือไม่ → ดึงใหม่
   - ตรวจว่า Cookie ถูกต้อง (เรียก API ทดสอบใน Postman)
2. ตรวจสอบ ShipmentNos:
   - รูปแบบถูกต้องหรือไม่
   - มีอยู่ในระบบ SCG หรือไม่
3. ตรวจสอบ API URL:
   - SCG_CONFIG.API_URL ถูกต้องหรือไม่
4. ตรวจสอบ SYS_LOG:
   - ดูข้อความ Error ล่าสุด
```

#### T-005: Google Maps API Quota หมด

**อาการ:** geocodeAddress() คืน null หรือ Error

**วิธีแก้:**

```
1. ตรวจสอบ Google Cloud Console → APIs → Geocoding API → Quotas
2. หาก Quota หมด:
   - เพิ่ม Quota หรือรอรอบใหม่
   - ตรวจสอบ CacheService ว่าใช้ Cache ได้ (ผ่าน @customFunction formulas — ไม่ต้องเรียก API ซ้ำ)
3. ตรวจสอบว่าใช้ Built-in Geocoder แทน API Key ได้หรือไม่
```

#### T-006: Match Engine จับคู่ผิด

**อาการ:** ข้อมูลถูกจับคู่กับ Person/Place ผิด

**วิธีแก้:**

```
1. ตรวจสอบ match_confidence ใน FACT_DELIVERY:
   - หาก ≥ 90 → Auto Match (ต้องรายงานเป็น Bug)
   - หาก 50-89 → ควรอยู่ใน Q_REVIEW
2. ตรวจสอบ Alias:
   - Alias ผิดหรือไม่ → ลบจาก M_ALIAS
3. ปรับ Threshold:
   - เพิ่ม THRESHOLD_AUTO หาก Auto Match ผิดบ่อย
4. ตรวจสอบ Normalize Logic:
   - ชื่อที่คล้ายกันมาก (เช่น สมชาย vs สมชัย) อาจจับผิด
```

#### T-007: Sheet หายหรือคอลัมน์ไม่ครบ

**อาการ:** System Integrity Check แจ้ง Sheet หายหรือคอลัมน์ผิด

**วิธีแก้:**

```
1. รัน setupAllSheets() — ระบบจะ:
   - สร้าง Sheet ที่หาย
   - เพิ่มคอลัมน์ที่ขาด (ส่วนหัวสีแดง)
2. หาก Sheet ถูกลบโดยไม่ตั้งใจ:
   - รัน setupAllSheets()
   - นำเข้าข้อมูลจาก Backup
```

#### T-008: Pipeline Resume ไม่ทำงาน

**อาการ:** Auto-Resume Trigger ไม่ทำงานหลัง Timeout

**วิธีแก้:**

```
1. ตรวจสอบ Triggers ใน Apps Script Editor
2. หากไม่มี Auto-Resume Trigger:
   - รัน removeAutoResume_() ก่อน (ลบ trigger เสีย)
   - รัน Pipeline ซ้ำ
3. หากมี Trigger แต่ไม่ทำงาน:
   - ลบ Trigger เดิม
   - รัน Pipeline ใหม่
4. ตรวจสอบ SYS_LOG ว่ามี Error หรือไม่
```

### 11.2 ตารางรหัสข้อผิดพลาด

| รหัส | ข้อความ | สาเหตุ | วิธีแก้ |
|:---|:---|:---|:---|
| CRIT-001 | resolvedLat/Lng เป็น 0 | Initialize เป็น 0 แทน null | แก้ไขเป็น null (Fixed in V5.5) |
| CRIT-002 | upsertFactDelivery ไม่คืนค่า | Silent data loss | เก็บ return value (Fixed in V5.5) |
| CRIT-006 | Race condition | ไม่มี LockService | เพิ่ม LockService (Fixed in V5.5) |
| CRIT-008 | Cache เกิน 100KB | CacheService จำกัด 100KB | ใช้ Chunked Cache (Fixed in V5.5) |

---

## 12. การตรวจสอบระบบ (Monitoring)

### 12.1 ตัวชี้วัดที่ควรติดตาม

| ตัวชี้วัด | เป้าหมาย | วิธีตรวจสอบ | ความถี่ |
|:---|:---|:---|:---|
| Auto Match Rate | ≥ 80% | RPT_DATA_QUALITY | รายสัปดาห์ |
| Pending Review | = 0 | getReviewStats() | รายวัน |
| Cache Hit Rate | ≥ 70% | ตรวจสอบ CacheService entries (ผ่าน @customFunction) | รายเดือน |
| SYS_LOG Error Count | = 0 | กรอง level=ERROR | รายวัน |
| Script Execution Time | < 5 นาที | Apps Script Dashboard | รายวัน |
| FACT_DELIVERY Duplicates | = 0 | detectDoubleProcessing() | รายสัปดาห์ |

### 12.2 การตรวจสอบ SYS_LOG

```
1. เปิด Sheet SYS_LOG
2. กรองคอลัมน์ level = "ERROR"
3. ตรวจสอบข้อความและ stack trace
4. ดูคอลัมน์ module เพื่อระบุไฟล์ที่เกิดปัญหา
5. ลบ Log เก่า: ระบบจะล้างอัตโนมัติเมื่อเกิน 1,000 แถว
```

### 12.3 การตรวจสอบ Google Apps Script Dashboard

```
1. เปิด Apps Script Editor
2. ไปที่ Executions (▶️ ที่แถบซ้าย)
3. ตรวจสอบ:
   - Execution time (ต้องไม่เกิน 6 นาที)
   - Error rate (ต้อง < 5%)
   - Trigger status (ต้องไม่มี trigger ค้าง)
```

---

## 13. การย้ายระบบ (Migration)

### 13.1 การย้ายไป Spreadsheet ใหม่

```
1. Duplicate Spreadsheet ปัจจุบัน
2. ใน Spreadsheet ใหม่:
   - ตั้งค่า Script Properties ใหม่ทั้งหมด
   - ตรวจสอบ ADMIN_EMAILS
3. รัน setupAllSheets() เพื่อตรวจสอบ
4. รัน Preflight Audit
5. ทดสอบ Pipeline ด้วยข้อมูลจำนวนน้อย
6. เปลี่ยนผู้ใช้ไปใช้ Spreadsheet ใหม่
```

### 13.2 Hybrid Alias Migration (รันครั้งเดียว)

```javascript
// รัน MIGRATION_HybridAliasSystem() เพื่อ:
// 1. คัดลอกข้อมูลจาก M_PERSON_ALIAS → M_ALIAS
// 2. คัดลอกข้อมูลจาก M_PLACE_ALIAS → M_ALIAS
// 3. กำหนด master_uuid ให้ทุกแถวใน M_PERSON/M_PLACE

// ตรวจสอบก่อน Migration:
MIGRATION_HybridAliasSystem();

// ตรวจสอบหลัง Migration:
// - M_ALIAS ต้องมีข้อมูล
// - M_PERSON.master_uuid ต้องไม่ว่าง
// - M_PLACE.master_uuid ต้องไม่ว่าง
```

### 13.3 การย้ายรุ่น (Version Upgrade)

```
1. สำรองข้อมูล (Backup)
2. อัปเดตโค้ดใน Apps Script ตามไฟล์ใหม่
3. รัน validateConfig() เพื่อตรวจสอบ IDX consistency
4. รัน validateSchemaConsistency() เพื่อตรวจสอบ Schema
5. รัน setupAllSheets() เพื่อเพิ่มคอลัมน์ใหม่ (ถ้ามี)
6. รัน Preflight Audit
7. ทดสอบ Pipeline
```

---

## 14. ข้อจำกัดของ Google Apps Script

### 14.1 ข้อจำกัดที่สำคัญ

| ข้อจำกัด | ค่า | ผลกระทบต่อ LMDS | วิธีรับมือ |
|:---|:---|:---|:---|
| Execution Time | 6 นาที/ครั้ง | Pipeline อาจหยุดกลางคัน | Checkpoint + Auto-Resume |
| CacheService Size | 100KB/key | ข้อมูลใหญ่เกินเก็บไม่ได้ | Chunked Cache (200 items/chunk) |
| CacheService TTL | 6 ชั่วโมง | แคชหมดอายุเร็ว | ใช้ CacheService 6 ชม. (ผ่าน @customFunction) — *MAPS_CACHE sheet ถูกลบใน V5.5.013; FACT_DELIVERY +2 cols ใน V5.5.014* |
| Spreadsheet API Calls | 20,000/วัน | Batch operations ใช้เร็ว | Safe Batching (getValues/setValues) |
| URL Fetch | 20,000/วัน | SCG API + Maps API | 3-Layer Cache ลดการเรียก API |
| Script Properties | 500KB รวม | ข้อมูล Configuration | ใช้ sparingly |
| Concurrent Execution | 30 ต่อเวลาใดๆ | LockService จำเป็น | ใช้ LockService สำหรับ critical sections |

### 14.2 กลยุทธ์การเพิ่มประสิทธิภาพ

| ปัญหา | กลยุทธ์ | ผลลัพธ์ |
|:---|:---|:---|
| Stats Update ช้า | batchUpdateEntityStats_() | 96% ลด API calls |
| FACT_DELIVERY write ช้า | Accumulate-then-Flush | 98% ลด API calls |
| Alias flush ช้า | Batch Write + Pre-loaded Dedup | 99% ลด API calls |
| Geo Dictionary scan ช้า | Province Index Map | 97% ลด scan |
| Geo searchKey lookup ช้า | O(1) exact match index | 100% ลดเวลา |
| Log write ช้า | Buffer 50 entries/batch | 98% ลด API calls |
| Cache > 100KB | Chunked Cache pattern | 100% reliability |

---

## 15. ภาคผนวก: รายการค่าคงที่สำคัญ

### 15.1 Sheet Names (SHEET Object)

```javascript
SHEET = {
  PERSON: 'M_PERSON',
  PERSON_ALIAS: 'M_PERSON_ALIAS',
  PLACE: 'M_PLACE',
  PLACE_ALIAS: 'M_PLACE_ALIAS',
  ALIAS: 'M_ALIAS',
  GEO_POINT: 'M_GEO_POINT',
  DESTINATION: 'M_DESTINATION',
  FACT_DELIVERY: 'FACT_DELIVERY',
  Q_REVIEW: 'Q_REVIEW',
  SOURCE: 'SCGนครหลวงJWDภูมิภาค',
  DAILY_JOB: 'ตารางงานประจำวัน',
  TH_GEO: 'SYS_TH_GEO',
  SYS_LOG: 'SYS_LOG',
  SYS_CONFIG: 'SYS_CONFIG',
  EMPLOYEE: 'ข้อมูลพนักงาน',
  INPUT: 'Input',
  OWNER_SUMMARY: 'สรุป_เจ้าของสินค้า',
  SHIPMENT_SUMMARY: 'สรุป_Shipment',
  RPT_DATA_QUALITY: 'RPT_DATA_QUALITY'
}
```

> **[V5.5.013]** `MAPS_CACHE: 'MAPS_CACHE'` ถูกลบออกจาก SHEET object (ใช้ @customFunction formulas แทน)

### 15.2 Match Engine Rules

| Rule | เงื่อนไข | Action | Priority |
|:---:|:---|:---|:---|
| 1 | INVALID_LATLNG — พิกัดจาก Source หาย (lat=0, lng=0 หรือว่าง) | REVIEW_INVALID (Confidence: 0) | CRITICAL |
| 2 | LOW_QUALITY — ข้อมูลคุณภาพต่ำ (ชื่อสั้นเกิน/ที่อยู่ไม่ครบ) | REVIEW | HIGH |
| 3 | GEO_PROVINCE_CONFLICT — จังหวัดจาก Geo ไม่ตรงกับจังหวัดจากที่อยู่ | REVIEW (Confidence: 50) | HIGH |
| 3.5 | NEARBY_PENDING — Tiered Spatial: ≤50m AutoMerge, 51-79m Yellow, 80-100m Orange, >100m ใหม่ | ตามระยะทาง | MEDIUM |
| 4 | FULL_MATCH — Person + Place + Geo ตรงทั้งหมด | AUTO_MATCH | — |
| 5 | GEO_ANCHOR — เจอ Geo เดิม + Person เดิม (Place อาจใหม่) | AUTO_MATCH | — |
| 6 | FUZZY_MATCH — Score ≥ THRESHOLD_AUTO (90) | AUTO_MATCH | — |
| 7 | ALL_NEW_WITH_GEO — ทุกอย่างใหม่ มีพิกัด | CREATE_NEW | — |
| 8 | DEFAULT — ไม่เข้าเงื่อนไขใดๆ | REVIEW | — |

### 15.3 Status/Color Constants

```javascript
APP_CONST = {
  STATUS_ACTIVE: 'Active',
  STATUS_INACTIVE: 'Inactive',
  STATUS_MERGED: 'Merged',
  MATCH_AUTO: 'AUTO_MATCH',
  MATCH_CREATE: 'CREATE_NEW',
  MATCH_REVIEW: 'NEEDS_REVIEW',
  SYNC_PENDING: 'PENDING',
  SYNC_SUCCESS: 'SUCCESS',
  SYNC_REVIEW: 'REVIEW',
  SYNC_ERROR: 'ERROR',
  COLOR_GREEN: '#d9ead3',
  COLOR_YELLOW: '#fff2cc',
  COLOR_RED: '#f4cccc',
  COLOR_ORANGE: '#f6b26b',
  COLOR_BLUE: '#cfe2f3'
}
```

---

> **เอกสารฉบับนี้จัดทำสำหรับทีม IT ที่ดูแลระบบ LMDS V5.5**
>
> **เวอร์ชันเอกสาร:** 1.3 (ปรับปรุงตามโค้ดจริง V5.5.020 SECURITY-POSTFIX) | **วันที่:** มิถุนายน 2569
>
> **✅ หมายเหตุ — เวอร์ชันซิงค์แล้ว:**
>
> 1. **APP_VERSION ในโค้ด = `5.5.020`** — ตรงกันกับ System Guide แล้ว (ความแตกต่างเดิมระหว่าง 5.5.001 และ V5.5.014 ได้รับการแก้ไขแล้ว; V5.5.020 SECURITY-POSTFIX เพิ่ม SEC-008→012, OAuth scopes 10→6, isAuthorizedUser_ 13/13, Sheet Protection 8/19 + Q_REVIEW range, Production Readiness 95%→97%)
> 2. **Search Service ในโค้ดใช้ 2 Tier เท่านั้น** (Tier 0: M_ALIAS Fast Track + Tier 1: resolvePerson → getDestsByPersonId + NOT_FOUND) ตามนโยบาย ShipToName-Only v5.4.003 — นี่คือการใช้งานจริง (System Guide ฉบับเก่าอธิบาย 6 Tier ซึ่งเป็นแบบเก่าที่ถูกลบออกไปแล้ว)
> 3. **ID Format ในโค้ด** ใช้ prefix + 12 hex chars (เช่น Person = `PA3F7B2C9D0E1`) แต่ System Guide แสดงแบบสั้น 6 chars (เช่น `PS3k7x`)
> 4. **SYS_LOG auto-clean** ในโค้ด trigger เมื่อเกิน 5,001 แถว และเก็บไว้ 1,000 แถวล่าสุด (ไม่ใช่ 5,000 ตามที่ System Guide เขียน)
> 5. **SHEET count** ในโค้ดมี 19 entries (หลัง V5.5.013 ลบ MAPS_CACHE ออก; V5.5.014 เพิ่ม 2 cols ใน FACT_DELIVERY/SOURCE/DAILY_JOB)
>
> **สถิติระบบ:** ฟังก์ชัน 321 | บรรทัดโค้ด ~17,399 | IDX sets 16 | Compliance 16/16 COMPLIANT (Rule 16: Security-First Design, SEC-001→012, 14 audit cycles, 102 issues fixed, 97% Production Readiness, OAuth scopes 10→6, isAuthorizedUser_ 13/13, Sheet Protection 8/19 + Q_REVIEW range)
