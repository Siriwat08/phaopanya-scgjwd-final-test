# BLUEPRINT: LMDS Architecture V5.5.006 (post-Consistency-Sync)

> เอกสารสถาปัตยกรรมระบบ LMDS (Logistics Master Data System) ฉบับเต็ม
> ร่างสถาปัตยกรรมระดับ Core-System ชี้แจ้ง Data Schema, Pipeline Mechanics, Module Specification, Bug Status, Performance Analysis สำหรับนักพัฒนาระบบ
> Version: 5.5.006 (post-Consistency-Sync) | Last Updated: 2026-06-18
> **5 Audit Cycles Complete** | 53 Issues FIXED | 16/16 Immutable Laws COMPLIANT | Production Readiness: 95%

---

## สารบัญ

1. [เป้าหมายระบบ](#1-เป้าหมายระบบ)
2. [The Trinity Framework](#2-the-trinity-framework)
3. [Hybrid Alias Architecture](#3-hybrid-alias-architecture)
4. [Layered Architecture](#4-layered-architecture)
5. [Data Model](#5-data-model)
6. [Module Specification](#6-module-specification)
7. [Global Pipeline Mechanics](#7-global-pipeline-mechanics)
8. [Match Engine — Rules Matrix](#8-match-engine--rules-matrix)
9. [Execution Flow](#9-execution-flow)
10. [Caching Strategy](#10-caching-strategy)
11. [Dependencies Matrix](#11-dependencies-matrix)
12. [Error Handling & Disaster Prevention](#12-error-handling--disaster-prevention)
13. [Configuration & Schema System](#13-configuration--schema-system)
14. [Search Service — Tier Architecture](#14-search-service--tier-architecture)
15. [Migration Guide](#15-migration-guide)
16. [Single Writer Pattern (V5.5.001)](#16-single-writer-pattern-v55001)
17. [Bug Status & Improvement History](#17-bug-status--improvement-history)
18. [Performance Analysis](#18-performance-analysis)
23. [Security Architecture](#23-security-architecture-v55004--security-fix-cycle)
19. [Pre-Deploy Checklist](#19-pre-deploy-checklist)
20. [Production Notes](#20-production-notes)

---

## 1. เป้าหมายระบบ

LMDS ออกแบบเพื่อเป็น **Master Data + Matching Engine** สำหรับข้อมูลขนส่งที่คุณภาพไม่สม่ำเสมอ โดยเน้น 3 เสาหลัก:

| เสาหลัก | คำอธิบาย | กลไกในระบบ |
|---------|----------|------------|
| **Data Quality** | ข้อมูลถูกทำความสะอาด Normalize และตรวจสอบก่อนเข้าระบบ | NormalizeService, ThGeoService, 4-level Address Enrichment |
| **Traceability** | ทุกการตัดสินใจของระบบมีหลักฐานบันทึกสำรวจย้อนหลัง | `match_evidence`, `SYNC_STATUS`, `SYS_LOG`, Audit Trail |
| **Operational Continuity** | ระบบรันได้ทันทีกับข้อมูลใหม่ ไม่ต้อง Backfill ข้อมูลเก่า | Incremental Processing, Time Guard + Auto-Resume, LockService |

จุดเด่นสำคัญของ LMDS คือการเป็นทั้ง **Master Data Repository** และ **Matching Engine** ในระบบเดียวกัน ระบบออกแบบมาเพื่อรับมือกับข้อมูลขนส่งที่คุณภาพไม่สม่ำเสมอ อาจมีการพิมพ์ผิด ชื่อไม่ตรงกัน ที่อยู่ไม่ครบ หรือข้อมูลซ้ำซ้อน ระบบจะทำการ Normalize ข้อมูลเหล่านั้น จับคู่กับ Master ที่มีอยู่ และตัดสินใจว่าจะสร้างรายการใหม่ จับคู่อัตโนมัติ หรือส่งเข้าคิวตรวจสอบโดยมนุษย์ (Human-in-the-loop) ตามความเหมาะสม นอกจากนี้ยังมีระบบ Alias ที่ช่วยจดจำชื่อที่เขียนแตกต่างกันแต่หมายถึงบุคคลหรือสถานที่เดียวกัน ทำให้การจับคู่มีประสิทธิภาพสูงขึ้นเรื่อยๆ เมื่อระบบทำงานต่อเนื่อง

### Business Flow 2 กลุ่ม

| กลุ่ม | ชื่อ | โมดูล | หน้าที่ |
|-------|------|--------|--------|
| **Group 1** | Cleansing & Master DB | 05, 06, 07, 08, 09, 10, 16, 20, 21 | รับข้อมูลดิบ → ทำความสะอาด → จับคู่กับ Master → บันทึก FACT_DELIVERY → สร้าง Alias |
| **Group 2** | Daily Ops & Search | 04, 11, 12, 13, 15, 17, 18 | ดึงข้อมูล SCG API → ค้นหาพิกัดจาก Master → ใส่ LatLong ให้ข้อมูลงานประจำวัน |

กลุ่มทั้งสองทำงานแยกกัน — Search Service (`17_SearchService.gs`) เป็นสะพานเชื่อมเท่านั้น กฎสำคัญคือ **Group 2 ห้ามเขียน Master Data โดยตรง** (ต้องผ่าน Search Service เท่านั้น)

---

## 2. The Trinity Framework

LMDS Architecture รันด้วยตรรกะแบบแยกฐานข้อมูลเชิงสัมพันธ์ **"The Trinity Framework"**:

> การมีอยู่ของการจัดส่ง (Transaction/Fact) 1 ชิ้น จะผูกกันด้วย 3 เสาหลัก + 1 ตาราง Intersection

### 2.1 เสาหลักทั้ง 3

| เสา | ตาราง | บทบาท | กลไกหลัก |
|-----|-------|--------|----------|
| **WHO** | `M_PERSON` (10 คอลัมน์) | ระบุตัวตนบุคคล | กรอง Phone + Note จากข้อมูล Unstructured → Identify บุคคล |
| **WHERE-Address** | `M_PLACE` (14 คอลัมน์) | ระบุสถานที่ตามที่อยู่ | `RAW_ADDRESS` + `RESOLVED_ADDR` + `SYS_TH_GEO` 16 คอลัมน์ → ประกอบร่างที่อยู่สมบูรณ์ |
| **WHERE-Coordinate** | `M_GEO_POINT` (14 คอลัมน์) | ระบุพิกัด GPS | แกะ Coordinate จากเช็คอิน + `GEO_RADIUS_M` → จับรัศมีขยะ (Duplicate Location Merging ≤ 50m) |

แต่ละเสาทำงานอย่างอิสระในการจับคู่และสร้างข้อมูล แต่เชื่อมโยงกันผ่านตาราง Intersection ทำให้สามารถสืบค้นข้อมูลข้ามเสาได้อย่างมีประสิทธิภาพ เช่น การค้นหาพิกัดจากชื่อบุคคล หรือการหาสถานที่ทั้งหมดที่บุคคลหนึ่งเคยรับสินค้า การแยกเสาทำให้สามารถอัปเดตข้อมูลเสาใดเสาหนึ่งได้โดยไม่กระทบเสาอื่น เช่น การเปลี่ยนพิกัด GPS ไม่จำเป็นต้องเปลี่ยนข้อมูลที่อยู่

### 2.2 ตาราง Intersection

`M_DESTINATION` — ตารางศูนย์กลางสร้าง **Intersection Object Map**:

```
Person_ID + Place_ID + Geo_ID = 1 Destination Node
```

Destination เป็น Object ที่เชื่อมโยงทั้ง 3 เสาเข้าด้วยกัน ทำให้สามารถอ้างอิงการจัดส่งได้อย่างชัดเจนและสมบูรณ์ หากมีการเปลี่ยนแปลงที่เสาใดเสาหนึ่ง สามารถระบุได้ทันทีว่ากระทบ Destination ใดบ้าง ตัวอย่างเช่น ถ้าบุคคล A มีพิกัดอยู่ 3 จุด (บ้าน, ออฟฟิศ, คลังสินค้า) ระบบจะสร้าง Destination 3 รายการ แต่ละรายการจะผูก Person A เข้ากับ Place และ Geo ที่แตกต่างกัน

**ข้อสังเกตสำคัญ**: Destination ต้องมีทั้ง 3 FK (personId, placeId, geoId) จึงจะสมบูรณ์ — หากขาดเสาใดเสาหนึ่ง ระบบจะไม่สร้าง Destination และจะส่งเข้า Q_REVIEW แทน (Bug #V003: เคยใช้ `&&` แทน `||` ในการตรวจสอบ Trinity completeness)

---

## 3. Hybrid Alias Architecture

### 3.1 ภาพรวม

Hybrid Alias Architecture เป็นระบบจัดการชื่อแฝง (Alias) แบบคู่ ที่รองรับทั้ง **Entity-specific Alias** (ระดับ Local) และ **Global Alias Ledger** (ระดับ Global) โดยมี `master_uuid` เป็นกุญแจเชื่อมโยง ระบบนี้ช่วยแก้ปัญหาหลักคือ ข้อมูลขนส่งมักมีชื่อเดียวกันแต่เขียนต่างกัน เช่น "บริษัท สยาม คอนกรีต จำกัด", "สยามคอนกรีต", "Siam Concrete" ทั้งหมดหมายถึงบริษัทเดียวกัน ระบบ Alias จะจดจำชื่อทั้งหมดและเชื่อมโยงกลับไปยัง Master เดียวกัน

```
┌─────────────────────────────────────────────────────────────┐
│                    Hybrid Alias Architecture                 │
│                                                              │
│  ┌──────────────┐     ┌──────────────┐                      │
│  │ M_PERSON      │     │ M_PLACE      │                      │
│  │ person_id     │     │ place_id     │                      │
│  │ master_uuid ◄─┤     │ master_uuid ◄─┤                      │
│  └──────┬───────┘     └──────┬───────┘                      │
│         │                    │                               │
│  ┌──────▼───────┐     ┌──────▼───────┐                      │
│  │M_PERSON_ALIAS│     │M_PLACE_ALIAS │   ← Entity-specific  │
│  │ (Local)      │     │ (Local)      │                      │
│  └──────┬───────┘     └──────┬───────┘                      │
│         │                    │                               │
│         └───────┬────────────┘                               │
│                 ▼                                             │
│          ┌─────────────┐                                     │
│          │   M_ALIAS    │   ← Global Alias Ledger            │
│          │ master_uuid  │                                     │
│          │ variant_name │                                     │
│          │ entity_type  │                                     │
│          │ confidence   │                                     │
│          └─────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 หลักการสำคัญ

| หลักการ | รายละเอียด |
|---------|-----------|
| **Single Writer Pattern** | `autoEnrichAliasesFromFactBatch_()` ใน `10_MatchEngine.gs` เป็นจุดเขียน M_ALIAS จุดเดียวใน Pipeline อัตโนมัติ การเขียนจากที่อื่น (Migration/Admin) ต้องผ่าน `21_AliasService.gs` เท่านั้น |
| **master_uuid เป็นกุญแจข้ามโดเมน** | `M_PERSON` และ `M_PLACE` มีคอลัมน์ `master_uuid` (UUID v4) เพื่อเชื่อมโยง Entity เดียวกันที่อาจมีหลายรูปแบบชื่อ UUID นี้ถูกสร้างตอน `createPerson()` / `createPlace()` และไม่เปลี่ยนแปลงตลอดอายุของ Entity |
| **Runtime Fast-path** | resolve global alias → `master_uuid` → map → `person_id`/`place_id` → ลด false-negative ในเคสพิมพ์ไม่ตรงมาตรฐาน เส้นทางนี้ใช้โดย `fastLookupByShipToName()` สำหรับ Group 2 ทำให้ค้นหาพิกัดจากชื่อเร็วขึ้นมากโดยไม่ต้องผ่าน resolvePerson/resolvePlace |
| **Backward Compatibility** | ระบบยังคงรองรับ `M_PERSON_ALIAS` และ `M_PLACE_ALIAS` แบบเดิม สามารถทำงานร่วมกับ Global Alias ได้ การค้นหา Candidate จะค้นในทั้ง Local Alias และ Global Alias |
| **Circular Dependency Prevention** | ลบ `syncAliasToEntityTable_()` ออกแล้ว (V5.4.001) — เดิมทีมีปัญหา `createGlobalAlias() → syncAliasToEntityTable_() → createPersonAlias() → createGlobalAlias()` วนลูปไม่รู้จบ ตอนนี้ M_PERSON_ALIAS และ M_PLACE_ALIAS เขียนที่ `autoEnrichAliasesFromFactBatch_()` เท่านั้น |

### 3.3 M_ALIAS Schema (8 คอลัมน์)

| ดัชนี | ชื่อคอลัมน์ | ประเภท | คำอธิบาย |
|-------|-----------|--------|----------|
| 0 | `alias_id` | string | รหัส Alias เช่น `A_xxxx` (สร้างด้วย `generateShortId('A')`) |
| 1 | `master_uuid` | string | UUID v4 ที่เชื่อมโยงกับ M_PERSON หรือ M_PLACE |
| 2 | `variant_name` | string | ชื่อแฝง/รูปแบบอื่นที่ใช้เรียก Entity เดียวกัน (เก็บชื่อดิบไว้ ยังไม่ normalize) |
| 3 | `entity_type` | string | `PERSON` หรือ `PLACE` — บอกว่า UUID นี้เชื่อมกับโดเมนไหน |
| 4 | `confidence` | number | ระดับความมั่นใจ (0-100) — canonical=100, PERSON variant=95, PLACE variant=90 |
| 5 | `source` | string | แหล่งที่มา: `AUTO_ENRICH_FACT`, `MIGRATION`, `ADMIN_MERGE_ACT`, `SCG_RAW_IMPORT`, `FACT_DELIVERY_IMPORT` |
| 6 | `created_at` | datetime | วันเวลาที่สร้าง |
| 7 | `active_flag` | boolean | `true` (Active) หรือ `false` (Inactive) — ใช้ในการกรองตอนค้นหา |

### 3.4 Auto-Enrich กลไก

เมื่อ Pipeline ประมวลผลเสร็จ ระบบจะเขียน Alias อัตโนมัติจาก FACT_DELIVERY ผ่าน `autoEnrichAliasesFromFactBatch_()`:

1. **PERSON canonical** → M_ALIAS (confidence 100) — ชื่อสะอาดที่ได้จาก Normalize
2. **PERSON variant** (ShipToName) → M_ALIAS (confidence 95) + M_PERSON_ALIAS — ชื่อดิบที่ยังไม่ผ่านการทำความสะอาด
3. **PLACE canonical** → M_ALIAS (confidence 100) — ชื่อสถานที่สะอาด
4. **PLACE variant** (ShipToAddr) → M_ALIAS (confidence 90) + M_PLACE_ALIAS — ที่อยู่ดิบจาก SCG

ทั้งหมดใช้ Set-based dedup เพื่อป้องกันการเขียนซ้ำ — ระบบจะโหลด Alias ที่มีอยู่แล้วใน M_ALIAS, M_PERSON_ALIAS, M_PLACE_ALIAS มาสร้างเป็น Set ก่อน แล้วตรวจสอบว่าชื่อที่จะเขียนซ้ำหรือไม่ ถ้าซ้ำจะข้ามไป

### 3.5 Dedup Key Format

| ชีต | Dedup Key | ตัวอย่าง |
|------|-----------|---------|
| M_ALIAS | `ENTITY_TYPE::masterUuid::normalizedVariant` | `PERSON::a1b2c3d4::สยามคอนกรีต` |
| M_PERSON_ALIAS | `personId::normalizedVariant` | `PS1234::สยามคอนกรีต` |
| M_PLACE_ALIAS | `placeId::normalizedVariant` | `PL5678::123/45ถ.พระราม9` |

### 3.6 วิวัฒนาการ Alias Architecture

| เวอร์ชัน | ระบบ | จุดแข็ง | จุดอ่อน |
|----------|------|---------|---------|
| V4.0 | NameMapping | ง่าย ใช้ได้ทันที | ไม่ 3NF, ไม่มี active_flag, ชื่อซ้ำได้ |
| V5.2 | Entity-Specific (M_PERSON_ALIAS + M_PLACE_ALIAS) | 3NF, auto-enrichment, normalization | Alias อยู่ใน silo, ไม่มี cross-entity matching, M_ALIAS ว่าง |
| V5.4 | Hybrid (Local + Global M_ALIAS) | รวมจุดแข็งทั้ง 2 แบบ, Fast Track O(1) via reverse index, Single Writer | ต้อง Migration, ซับซ้อนกว่า |

---

## 4. Layered Architecture

ระบบ LMDS ออกแบบด้วยสถาปัตยกรรมแบบแยกชั้น 6 ชั้นหลัก:

### Layer A: Ingestion Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `04_SourceRepository.gs` |
| **แหล่งข้อมูล** | SCG API, ไฟล์รายวัน, Input จากผู้ใช้งาน |
| **Landing Sheets** | `SCGนครหลวงJWDภูมิภาค` (37 คอลัมน์), `ตารางงานประจำวัน` (29 คอลัมน์), `Input` |
| **กลไกหลัก** | อ่านเฉพาะ Record ที่ `SYNC_STATUS != SUCCESS` สร้าง Source Object ต่อ Record กรอง Invoice ที่มีอยู่แล้วใน FACT_DELIVERY แบบ Set-based lookup |
| **Caching** | `CACHE_KEY_SOURCE` — Cache source rows ที่อ่านแล้ว, `CACHE_KEY_INVOICES` — Invoice set จาก FACT |
| **Source Object** | `{ sourceSheet, sourceRow, invoiceNo, shipmentNo, deliveryDate, deliveryTime, driverName, truckLicense, soldToCode, soldToName, rawPersonName, rawPlaceName, rawAddress, scgAddress, resolvedAddr, rawLat, rawLng, hasGeo, warehouse, province, sourceId, remark }` |

### Layer B: Normalization Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `05_NormalizeService.gs`, `20_ThGeoService.gs` |
| **งานหลัก** | ทำความสะอาดชื่อ, เบอร์โทร, ที่อยู่, จังหวัด/อำเภอ/ตำบล, รหัสไปรษณีย์ |
| **กลไกหลัก** | 7-step Person Normalization (strip prefix → extract phone → extract doc ID → clean → normalize → build phonetic key → assemble), 4-step Place Normalization, Thai Phonetic Key, 80+ คำนำหน้าชื่อไทย |
| **ผลลัพธ์ Person** | `{ cleanName, isCompany, extractedPhone, extractedDocNo, deliveryNotes[], originalName }` |
| **ผลลัพธ์ Place** | `{ cleanPlace, placeType, notes[] }` |
| **Phonetic Key** | Thai consonants only, max 6 chars — ใช้ `normalizeForCompare()` ลดช่องว่างและตัวพิมพ์ |
| **ขยะไม่ทิ้ง** | ข้อมูลที่สกัดได้ (เลขบัตร, เบอร์โทร, คำนำหน้า) ถูกเก็บใน `deliveryNotes[]` → คอลัมน์ `NOTE` เพื่อใช้ Deep Note Search ภายหลัง |

### Layer C: Master Resolution Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `06_PersonService.gs`, `07_PlaceService.gs`, `08_GeoService.gs`, `09_DestinationService.gs`, `10_MatchEngine.gs` |
| **กลไกหลัก** | Multi-strategy Candidate Search — Person 5 กลยุทธ์ (M_ALIAS Fast Path → Phone → Alias → Phonetic → Note Search), Place 4 กลยุทธ์ (M_ALIAS Fast Path → Alias → Phonetic → Note Search), Grid-based Proximity สำหรับ Geo, Trinity Intersection สำหรับ Destination |
| **Scoring Person** | Phone=95, Dice(0.5)+Levenshtein(0.3)+Ratio(0.2) สำหรับชื่อ ≥4 ตัวอักษร, Dice(0.6)+Levenshtein(0.4) สำหรับชื่อสั้น |
| **Scoring Place** | Exact=100, Dice(0.6)+Levenshtein(0.4), Place_SCORE_MIN=55 |

### Layer D: Hybrid Alias Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `21_AliasService.gs` |
| **Local Alias** | `M_PERSON_ALIAS` (6 คอลัมน์), `M_PLACE_ALIAS` (6 คอลัมน์) |
| **Global Alias** | `M_ALIAS` (8 คอลัมน์ — Global Alias Ledger) |
| **Cross-domain Identity** | `master_uuid` ใน `M_PERSON` (col 9), `M_PLACE` (col 13) |
| **Runtime Fast-path** | `fastLookupByShipToName()` — ShipToName → M_ALIAS reverse index → masterUuid → entityId → dest → lat,lng |
| **Read Path** | `loadGlobalAliasesMap_()` — uuid → variants[], `loadGlobalAliasReverseIndex_()` — variant → {masterUuid, entityType}[] |
| **Write Path** | ⚠️ Pipeline: `autoEnrichAliasesFromFactBatch_()` เท่านั้น, Admin/Migration: `createGlobalAlias()`, `MIGRATION_HybridAliasSystem()` |

### Layer E: Transaction & Review Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `11_TransactionService.gs`, `12_ReviewService.gs` |
| **ธุรกรรม** | ข้อมูลลง `FACT_DELIVERY` — 32 คอลัมน์ บันทึกผลการจับคู่ทั้งหมด รวมถึง match_evidence สำหรับตรวจสอบย้อนหลัง |
| **คิวรอตรวจ** | เคสคลุมเครือเข้า `Q_REVIEW` — 22 คอลัมน์ พร้อม Candidate IDs (JSON-encoded) และ Recommendation |
| **Human Decision** | `CREATE_NEW` / `MERGE_TO_CANDIDATE` / `IGNORE` / `ESCALATE` — เลือกผ่าน Dropdown ในชีต Q_REVIEW ระบบประมวลผลทันทีผ่าน `onEdit()` trigger |
| **Color Coding** | Done=`#d9ead3`, P3 (สูง)=`#f4cccc`, P2 (กลาง)=`#fff2cc`, GEO_NEARBY_YELLOW=`#fff2cc`, GEO_NEARBY_ORANGE=`#fce5cd` |

### Layer F: Governance & Hardening Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `19_Hardening.gs`, `03_SetupSheets.gs` (SYS_LOG), `13_ReportService.gs` |
| **งานหลัก** | Preflight checks (ตรวจสอบชีต, Schema, API Key ก่อนรัน), Audit Log (SYS_LOG auto-clean at 5,000 rows), Quality Reporting (RPT_DATA_QUALITY), Duplicate Detection (detectDoubleProcessing) |
| **Diagnostic** | `diagnoseSystemState()` — วินิจฉัยแบบครบวงจร: ตรวจชีต, คอลัมน์, ข้อมูลว่าง, SYNC_STATUS, SYS_LOG Errors พร้อมวิธีแก้ |

---

## 5. Data Model

### 5.1 Master Tables

#### M_PERSON (10 คอลัมน์) — Index Constant: `PERSON_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `person_id` | string | รหัสบุคคล เช่น `P_xxxx` (สร้างด้วย `generateShortId('P')`) |
| 1 | `canonical_name` | string | ชื่อมาตรฐานที่สะอาดแล้ว (ผ่าน `normalizePersonNameFull()`) |
| 2 | `normalized_name` | string | ชื่อที่ normalize แล้วสำหรับการเปรียบเทียบ (ใช้ `normalizeForCompare()`) |
| 3 | `phone` | string | เบอร์โทรที่สกัดได้ (เก็บด้วย single-quote prefix เพื่อรักษา leading zero) |
| 4 | `first_seen` | datetime | วันที่พบครั้งแรก |
| 5 | `last_seen` | datetime | วันที่พบล่าสุด (อัปเดตทุกครั้งที่ AUTO_MATCH) |
| 6 | `usage_count` | number | จำนวนครั้งที่ใช้ใน FACT (อัปเดตทุกครั้งที่ AUTO_MATCH) |
| 7 | `status` | string | `Active` / `Merged` (Merged = ถูกรวมเข้า personId อื่น) |
| 8 | `note` | string | หมายเหตุ/รหัสที่สกัดได้ (Deep Note Search) — เก็บเป็น comma-separated |
| 9 | `master_uuid` | string | UUID v4 สำหรับเชื่อมโยงข้ามโดเมน (สร้างด้วย `Utilities.getUuid()`) |

#### M_PLACE (14 คอลัมน์) — Index Constant: `PLACE_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `place_id` | string | รหัสสถานที่ เช่น `PL_xxxx` |
| 1 | `canonical_name` | string | ชื่อมาตรฐาน (ใช้ที่อยู่ที่ซ่อมแล้วจาก `getEnrichedGeoData()`) |
| 2 | `normalized_name` | string | ชื่อที่ normalize แล้วสำหรับเปรียบเทียบ |
| 3 | `place_type` | string | ประเภทสถานที่ (condo/mall/house/site/other) |
| 4 | `sub_district` | string | ตำบล/แขวง (จาก SYS_TH_GEO 100%) |
| 5 | `district` | string | อำเภอ/เขต (จาก SYS_TH_GEO 100%) |
| 6 | `province` | string | จังหวัด (จาก Whitelist 77 จังหวัด) |
| 7 | `postcode` | string | รหัสไปรษณีย์ |
| 8 | `first_seen` | datetime | วันที่พบครั้งแรก |
| 9 | `last_seen` | datetime | วันที่พบล่าสุด |
| 10 | `usage_count` | number | จำนวนครั้งที่ใช้ |
| 11 | `status` | string | `Active` / `Merged` |
| 12 | `note` | string | หมายเหตุ (เก็บ suffix, delivery note) |
| 13 | `master_uuid` | string | UUID v4 สำหรับเชื่อมโยงข้ามโดเมน |

#### M_GEO_POINT (14 คอลัมน์) — Index Constant: `GEO_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `geo_id` | string | รหัสพิกัด เช่น `GE_xxxx` |
| 1 | `lat` | number | ละติจูด |
| 2 | `lng` | number | ลองจิจูด |
| 3 | `radius_m` | number | รัศมีรวมจุด (เมตร) — ใช้สำหรับ Tiered Spatial |
| 4 | `resolved_addr` | string | ที่อยู่ที่แก้แล้ว (จาก Google Maps หรือ Dictionary) |
| 5 | `province` | string | จังหวัด |
| 6 | `district` | string | อำเภอ/เขต |
| 7 | `source` | string | แหล่งที่มาของพิกัด (`driver`, `geocode`, `manual`) |
| 8 | `confidence` | number | ระดับความมั่นใจ |
| 9 | `first_seen` | datetime | วันที่พบครั้งแรก |
| 10 | `last_seen` | datetime | วันที่พบล่าสุด |
| 11 | `usage_count` | number | จำนวนครั้งที่ใช้ |
| 12 | `status` | string | `Active` / `Merged` |
| 13 | `extraction` | string | ข้อมูลการสกัดพิกัด |

#### M_DESTINATION (11 คอลัมน์) — Index Constant: `DEST_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `dest_id` | string | รหัส Destination เช่น `DS_xxxx` |
| 1 | `person_id` | string | FK → M_PERSON |
| 2 | `place_id` | string | FK → M_PLACE |
| 3 | `geo_id` | string | FK → M_GEO_POINT |
| 4 | `lat` | number | ละติจูด (validated) |
| 5 | `lng` | number | ลองจิจูด (validated) |
| 6 | `route_label` | string | ป้ายกำกับเส้นทาง |
| 7 | `delivery_date` | string | วันที่จัดส่งล่าสุด |
| 8 | `usage_count` | number | จำนวนครั้งที่ใช้ |
| 9 | `last_seen` | string | วันที่พบล่าสุด |
| 10 | `status` | string | `Active` / `Merged` |

### 5.2 Alias Tables

#### M_PERSON_ALIAS (6 คอลัมน์) — Index Constant: `PERSON_ALIAS_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `alias_id` | string | รหัส Alias เช่น `PA_xxxx` |
| 1 | `person_id` | string | FK → M_PERSON |
| 2 | `alias_name` | string | ชื่อแฝง (เก็บชื่อดิบ) |
| 3 | `match_score` | number | คะแนนจับคู่ (95 สำหรับ auto-enrich) |
| 4 | `created_at` | datetime | วันที่สร้าง |
| 5 | `active_flag` | boolean | `true` / `false` |

#### M_PLACE_ALIAS (6 คอลัมน์) — Index Constant: `PLACE_ALIAS_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `alias_id` | string | รหัส Alias เช่น `PLA_xxxx` |
| 1 | `place_id` | string | FK → M_PLACE |
| 2 | `alias_name` | string | ชื่อแฝง (เก็บชื่อดิบ) |
| 3 | `match_score` | number | คะแนนจับคู่ (90 สำหรับ auto-enrich) |
| 4 | `created_at` | datetime | วันที่สร้าง |
| 5 | `active_flag` | boolean | `true` / `false` |

#### M_ALIAS — Global Alias Ledger (8 คอลัมน์) — Index Constant: `ALIAS_IDX`

(ดูรายละเอียดที่หัวข้อ 3.3)

### 5.3 Transaction Tables

#### FACT_DELIVERY (32 คอลัมน์) — Index Constant: `FACT_IDX`

| กลุ่ม | คอลัมน์หลัก | คำอธิบาย |
|-------|-----------|----------|
| **Identity** | `tx_id`, `invoice_no`, `shipment_no` | รหัสธุรกรรมและเอกสาร — tx_id สร้างด้วย `generateShortId('TX')` |
| **Trinity FK** | `person_id`, `place_id`, `geo_id`, `dest_id` | Foreign Key ไปยัง 3 เสา + Intersection |
| **Coordinate** | `raw_lat`, `raw_lng`, `resolved_lat`, `resolved_lng` | พิกัดจาก Master + พิกัดจริงจาก Source |
| **Match Info** | `match_status`, `match_confidence`, `match_reason`, `match_action`, `evidence` | หลักฐานการจับคู่ (Traceability) — evidence เช่น `name|geo`, `name|place|geo` |
| **Delivery** | `delivery_date`, `delivery_time`, `sold_to_name`, `ship_to_name`, `ship_to_address` | ข้อมูลการจัดส่ง |
| **Source** | `source_sheet`, `source_row`, `source_rec_id` | ตำแหน่งข้อมูลต้นทางสำหรับสืบค้นย้อนหลัง |
| **Status** | `record_status`, `created_at`, `updated_at` | สถานะและการติดตาม |

#### Q_REVIEW (22 คอลัมน์) — Index Constant: `REVIEW_IDX`

| กลุ่ม | คอลัมน์หลัก | คำอธิบาย |
|-------|-----------|----------|
| **Identity** | `review_id`, `invoice_no` | รหัส Review |
| **Decision** | `status`, `decision`, `priority` | สถานะ/การตัดสินใจ/ความสำคัญ (priority 1=สูงสุด, 3=ต่ำสุด) |
| **Source** | `raw_person`, `raw_place`, `raw_sys_addr`, `raw_lat`, `raw_lng` | ข้อมูลดิบจาก Source |
| **Candidates** | `cand_persons`, `cand_places`, `cand_geos`, `cand_dests` | JSON-encoded candidate IDs |
| **Recommendation** | `match_score`, `recommend` | คะแนนและคำแนะนำจากระบบ |

### 5.4 System Tables

#### SYS_LOG (6 คอลัมน์) — Index Constant: `SYS_LOG_IDX`
`timestamp`, `level` (INFO/WARN/ERROR/DEBUG), `module`, `message`, `detail`, `session_id` — Auto-clean ที่ 5,000 แถว ป้องกันชีตบวม

#### SYS_CONFIG (4 คอลัมน์)
`key`, `value`, `description`, `updated_at` — เก็บค่าที่ผู้ใช้ตั้งเอง เช่น GEMINI_API_KEY

#### SYS_TH_GEO (16 คอลัมน์) — Index Constant: `TH_GEO_IDX`
ข้อมูลภูมิศาสตร์ไทย 7,537 รายการ — จังหวัด อำเภอ ตำบล รหัสไปรษณีย์ พร้อม metadata สำหรับค้นหา (tambon_clean, amphoe_clean, changwat_clean, tambon_label, amphoe_label, changwat_label, tambon_norm, amphoe_norm, changwat_norm, search_key, postal_key, note_type, note_scope) เป็น Single Source of Truth สำหรับการแกะที่อยู่ภาษาไทย ค่าที่คืนจาก `getEnrichedGeoData()` ต้องตรงกับ SYS_TH_GEO 100%

#### MAPS_CACHE (10 คอลัมน์) — Index Constant: `MAPS_CACHE_IDX`
แคชผลลัพธ์ Google Maps API — `cache_key`, `input_addr`, `lat`, `lng`, `resolved_addr`, `province`, `district`, `hit_count`, `created_at`, `updated_at` — ป้องกันการเรียก API ซ้ำเมื่อที่อยู่เดียวกัน

### 5.5 Source Sheet

#### SCGนครหลวงJWDภูมิภาค (37 คอลัมน์) — Index Constant: `SRC_IDX`
ข้อมูลดิบจาก SCG API — ประกอบด้วย ลำดับ, ID, วันที่ส่ง, เวลา, พิกัดรวม, ชื่อคนขับ, ทะเบียนรถ, Shipment No, Invoice No, ชื่อปลายทาง, ที่อยู่ปลายทาง, ชื่อเจ้าของสินค้า, LAT, LNG, คลังสินค้า, ฯลฯ และ `SYNC_STATUS` ที่คอลัมน์ 36 (0-based) ซึ่งเป็นตัวบอกว่าแถวนั้นถูกประมวลผลแล้วหรือยัง

---

## 6. Module Specification

### 6.1 โมดูลหลัก (22 ไฟล์)

| ไฟล์ | บรรทัด | หน้าที่ | ฟังก์ชันสำคัญ | Dependencies |
|------|--------|--------|--------------|-------------|
| `00_App.gs` | 879 | จุดเริ่มระบบ, เมนู, Pipeline orchestration, Smart Navigation, Diagnostic | `onOpen()`, `onEdit()`, `runFullPipeline()`, `diagnoseSystemState()`, `safeRun()` | 01, 02, 10, 17, 13, 18, 16, 21 |
| `01_Config.gs` | 699 | Single Source of Truth สำหรับค่าคงที่ (20 ชีต, 17 IDX sets, AI/SCG/APP configs) | `validateConfig()`, `getGeminiApiKey()`, `invalidateAllGlobalCaches()` | None (root) |
| `02_Schema.gs` | 503 | นิยาม Header ทุกชีต (19 schema) + Validation | `getSheetHeaders()`, `validateSheetHeaders()`, `getColIndex()`, `validateSchemaConsistency()` | 01 |
| `03_SetupSheets.gs` | 549 | สร้างชีตทั้งหมด, auto-repair, ระบบ Logging (SYS_LOG) | `setupAllSheets()`, `logInfo/Warn/Error/Debug()`, `clearOldLogs_()` | 01, 02, 14 |
| `04_SourceRepository.gs` | 631 | อ่าน/กรอง/สร้าง Object จากข้อมูลดิบ + Caching | `getAllSourceRows()`, `getUnprocessedRows()`, `updateSyncStatus_()` | 01, 02, 14 |
| `05_NormalizeService.gs` | 484 | ทำความสะอาดชื่อและที่อยู่ภาษาไทย (80+ prefixes) | `normalizePersonNameFull()`, `normalizePlaceName()`, `buildThaiPhoneticKey()`, `normalizeForCompare()` | 14 |
| `06_PersonService.gs` | 561 | Person CRUD + 5-strategy Candidate Search + Scoring | `resolvePerson()`, `findPersonCandidates()`, `scorePersonCandidate()`, `createPerson()`, `mergePersonRecords()` | 01, 02, 05, 14, 21 |
| `07_PlaceService.gs` | 827 | Place CRUD + 4-level Address Enrichment + Branch Matching | `resolvePlace()`, `findPlaceCandidates()`, `getEnrichedGeoData()`, `tryMatchBranch()` | 01, 02, 05, 14, 21, 16, 20 |
| `08_GeoService.gs` | 478 | Geo CRUD + Grid-based Proximity + Tiered Spatial | `resolveGeo()`, `findGeoCandidates_()`, `haversineDistance()`, `createGeoPoint()` | 01, 02, 14, 07, 15 |
| `09_DestinationService.gs` | 426 | Destination CRUD + Trinity Intersection | `resolveDestination()`, `createDestination()`, `getDestsByPersonId()`, `getDestsByPersonAndPlace()` | 01, 02, 14 |
| `10_MatchEngine.gs` | 1,374 | หัวใจ Pipeline: 8 Rules + Single Writer M_ALIAS + Auto-Resume | `runMatchEngine()`, `processOneRow()`, `makeMatchDecision()`, `executeDecision()`, `resolveAndPersist_()`, `autoEnrichAliasesFromFactBatch_()` | 01, 02, 05, 06-09, 11, 12, 14 |
| `11_TransactionService.gs` | 334 | FACT_DELIVERY upsert (32-col array) | `upsertFactDelivery()`, `findFactRowByInvoice_()` | 01, 02, 06-08, 14 |
| `12_ReviewService.gs` | 702 | Human-in-the-loop management (4 decisions) | `enqueueReview()`, `applyReviewDecision()`, `applyAllPendingDecisions()` | 01, 02, 06-09, 11, 14 |
| `13_ReportService.gs` | 276 | รายงานคุณภาพข้อมูล (autoMatchRate vs processedRate) | `buildFullQualityReport()`, `highlightHighPriorityReviews()` | 01, 02, 06-09, 12 |
| `14_Utils.gs` | 822 | ไลบรารีใช้ร่วม — String Similarity, GPS, AI, Retry, Cache, Stats | `diceCoefficient()`, `levenshteinDistance()`, `callGeminiAPI()`, `generateShortId()`, `safeUiAlert_()`, `normalizeInvoiceNo()`, `batchUpdateEntityStats_()`, `saveChunkedCache_()`, `loadChunkedCache_()`, `buildGlobalAliasDedupSet_()` | 01 |
| `15_GoogleMapsAPI.gs` | 473 | Geocoding + 3-layer Cache (RAM → Sheet → API) | `geocodeAddress()`, `reverseGeocode()`, `cachedGeoLookup_()`, `getRouteDistanceKm()`, `clearMapsCache()` | 01, 02, 14 |
| `16_GeoDictionaryBuilder.gs` | 586 | สร้าง/จัดการพจนานุกรมภูมิศาสตร์ไทย + Chunked Cache | `buildGeoDictionary()`, `lookupByPostcode()`, `scanAddressAgainstDictionary()`, `stripThaiAdminPrefix_()`, `stripThaiProvincePrefix_()` | 01, 02, 05, 20, 14 |
| `17_SearchService.gs` | 372 | สะพาน Group 2→1, 2-Tier Search for Daily Job (ShipToName-Only) | `findBestGeoByPersonPlace()`, `runLookupEnrichment()`, `lookupSingleRow()` | 01, 02, 05, 14, 21, 06, 09 |
| `18_ServiceSCG.gs` | 752 | ดึงข้อมูล SCG → ชีตรายวัน + Summaries | `fetchDataFromSCGJWD()`, `applyMasterCoordinatesToDailyJob()`, `buildOwnerSummary()`, `buildShipmentSummary()` | 01, 02, 17 |
| `19_Hardening.gs` | 535 | Preflight Audit, Duplicate Detection, Alias Generation | `runPreflightAudit()`, `detectDoubleProcessing()`, `generatePersonAliasesFromHistory()` | 01, 02, 05-09, 14 |
| `20_ThGeoService.gs` | 326 | สกัดภูมิศาสตร์ไทยจากที่อยู่ดิบ + Metadata | `extractGeoFromAddress()`, `populateGeoMetadata()`, `transformGeoMetadataRow_()`, `flushGeoMetadataBatch_()` | 01, 02, 05, 16, 14 |
| `21_AliasService.gs` | 1,163 | Hybrid Alias — Fast Track, Global Alias, Migration, UUID | `fastLookupByShipToName()`, `resolveMasterUuidViaGlobalAlias()`, `createGlobalAlias()`, `MIGRATION_HybridAliasSystem()`, `assignMasterUuidIfMissing()` | 01, 02, 05, 06, 07, 09, 14 |

### 6.2 สถิติโมดูล

| ตัวชี้วัด | ค่า |
|----------|-----|
| **Total Files** | 22 |
| **Total Lines** | 13,919 |
| **Total Functions** | 310 |
| **Largest File** | `10_MatchEngine.gs` (1,374 บรรทัด) |
| **Smallest File** | `20_ThGeoService.gs` (326 บรรทัด) |
| **Most Dependencies** | `10_MatchEngine.gs`, `12_ReviewService.gs` (6+ modules) |

---

## 7. Global Pipeline Mechanics

### Phase A: Ingestion (04_SourceRepository.gs)

1. อ่าน `SCGนครหลวงJWDภูมิภาค` จำกัดเพดาน Caching เฉพาะ Record ที่ `SYNC_STATUS != SUCCESS`
2. Filter และสร้าง Object Context 1 Record (รวบรวม `sysAddr`, `rawPlaceName`, `rawPersonName`, `lat`, `lng`, `invoiceNo`, `deliveryDate`)
3. กรอง Invoice ที่มีอยู่แล้วใน FACT_DELIVERY (Set-based lookup เพื่อป้องกัน duplicate)
4. Auto-mark รายการที่ถูกข้ามเป็น SUCCESS — แถวที่มี Invoice ซ้ำจะถูก mark เป็น SUCCESS ทันทีโดยไม่ต้องประมวลผลซ้ำ

### Phase B: Enrichment & Extraction (05_NormalizeService.gs / 07_PlaceService.gs / 20_ThGeoService.gs)

1. นำ Name เข้า Normalizer สกัดเลขรหัส (`\b[0-9]{8,}\b`) หรือเบอร์โทร (`+66..`)
2. วัตถุดิบ "ขยะ" ไม่ทิ้ง — Push Array แยกด้วย Comma → คอลัมน์ `NOTE` (Context for Deep Note Search)
3. Geo Hierarchy Strategy: แกะด้วย Array Regex หรือโค้ดไปรษณีย์ → เข้า Dictionary ลำดับคือ `extractGeoFromAddress` (16-col Search Key) → `scanAddressAgainstDictionary` → Regex+Fuzzy Lookup → `lookupByPostcode` (Fallback สุดท้าย)
4. Fallback (Plus Code + ภูมิลำเนาแหว่ง): `lookupPlaceAdminById_()` กู้คืน Province & District จาก M_PLACE ที่เชื่อมอยู่

### Phase C: Rules Matrix Resolution (10_MatchEngine.gs)

(ดูรายละเอียดที่หัวข้อ 8)

### Phase D: Persistence Control (Checkpoint & Chunking)

1. อัด Data เข้า Array — ทุกรอบ Batches (`BATCH_SIZE = 20`):
   - สาด Record Status ผ่าน `RangeList` (A1 Notations) ลด Overhead API Data Write 15-25%
   - บันทึก FACT_DELIVERY + Q_REVIEW + M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS ในครั้งเดียว (flush at end)
2. Time guard: นับ `Date.now()` หาก > 300,000ms (5 นาที):
   - เซ็ต Trigger Script สวมวิญญาณ Job ยิงคำสั่งตื่นภายใน 60 วิ
   - ตัวเอง Kill การทำงาน — ป้องกันอาการค้างหรือ Corrupted Caches
3. Checkpoint: SYNC_STATUS ทำหน้าที่แทน Checkpoint — แถวที่ประมวลผลแล้วจะถูก mark เป็น SUCCESS ทำให้รอบถัดไปไม่ต้องทำซ้ำ

---

## 8. Match Engine — Rules Matrix

ตารางน้ำหนักการประเมิน 8 กฎหลัก ของ `makeMatchDecision()`:

| กฎ | ชื่อ | เงื่อนไข | Action | Priority |
|----|------|---------|--------|----------|
| 1 | **INVALID_LATLNG** | พิกัดจาก Source หายไป (lat=0, lng=0 หรือว่าง) | `REVIEW_INVALID` Confidence: 0 | CRITICAL |
| 2 | **LOW_QUALITY** | ข้อมูลคุณภาพต่ำ (ชื่อสั้นเกิน/ที่อยู่ไม่ครบ) | `REVIEW` | HIGH |
| 3 | **GEO_PROVINCE_CONFLICT** | จังหวัดจาก Geo (ใน Master) ไม่ตรงกับจังหวัดจากที่อยู่ (ใน Source) | `REVIEW` Confidence: 50 | HIGH |
| 3.5 | **NEARBY_PENDING** | Tiered Spatial: ≤50m AutoMerge, 51-79m Yellow, 80-100m Orange, >100m Area ใหม่ | ตามระยะ | MEDIUM |
| 4 | **FULL_MATCH** | Person + Place + Geo ตรงทั้งหมด → `AUTO_MATCH` | `AUTO_MATCH` | — |
| 5 | **GEO_ANCHOR** | เจอ Geo เดิม + Person เดิม (Place อาจใหม่) → ใช้พิกัดเดิม | `AUTO_MATCH` | — |
| 6 | **FUZZY_MATCH** | Score ≥ THRESHOLD_AUTO (90) → จับคู่อัตโนมัติ | `AUTO_MATCH` | — |
| 7 | **ALL_NEW_WITH_GEO** | ทุกอย่างใหม่ มีพิกัด → สร้าง Master ใหม่ | `CREATE_NEW` | — |
| 8 | **DEFAULT** | ไม่เข้ากฎใดข้างต้น → ส่งตรวจสอบ | `REVIEW` | — |

### Decision Flow

```
makeMatchDecision(ctx)
  │
  ├─ Rule 1: INVALID_LATLNG? → REVIEW_INVALID
  ├─ Rule 2: LOW_QUALITY? → REVIEW
  ├─ Rule 3: GEO_PROVINCE_CONFLICT? → REVIEW
  ├─ Rule 3.5: NEARBY_PENDING? → ตามระยะ (FOUND/NEARBY_YELLOW/NEARBY_ORANGE/NOT_FOUND)
  ├─ Rule 4: FULL_MATCH (Person+Place+Geo)? → AUTO_MATCH
  ├─ Rule 5: GEO_ANCHOR (Geo+Person เดิม)? → AUTO_MATCH
  ├─ Rule 6: FUZZY_MATCH (Score ≥ 90)? → AUTO_MATCH
  ├─ Rule 7: ALL_NEW_WITH_GEO? → CREATE_NEW
  └─ Rule 8: DEFAULT → REVIEW
```

### กฎพิเศษ: Same-Day Destination

`getSameDayDestinations()` ตรวจสอบว่ามีการจัดส่งในวันเดียวกันไปยัง Destination เดียวกันแล้วหรือยัง ถ้ามี ระบบจะใช้ Destination เดิมแทนการสร้างใหม่ ป้องกัน Duplicate Destination

### กฎพิเศษ: Same Geo Multi-Person

`detectSameGeoMultiPerson()` ตรวจจับว่ามีหลายบุคคลใช้พิกัดเดียวกัน (ซ้ำซ้อน) — ถ้าพบ จะส่งเข้า Q_REVIEW เพื่อให้ผู้ตรวจสอบพิจารณาว่าเป็นบุคคลเดียวกันหรือไม่

---

## 9. Execution Flow

### 9.1 Group 1: Full Pipeline Flow

```
onOpen() → สร้างเมนู "LMDS V5.4"
    │
    ▼ ผู้ใช้กด "Run Full Pipeline"
runFullPipeline()
    │
    ├─ runLoadSource() → อ่านข้อมูลดิบ (04_SourceRepository)
    │    └─ getUnprocessedRows() → กรอง SYNC_STATUS != SUCCESS
    │
    ├─ runMatchEngine() → ประมวลผลทีละแถว (10_MatchEngine)
    │    ├─ for each row:
    │    │   ├─ normalizePersonNameFull() → 7-step Person Normalization
    │    │   ├─ normalizePlaceName() → 4-step Place Normalization
    │    │   ├─ getEnrichedGeoData() → 4-level Address Enrichment
    │    │   ├─ extractGeoFromAddress() → 3-tier Geo Search
    │    │   ├─ resolvePerson() → 5-strategy Candidate Search
    │    │   ├─ resolvePlace() → 4-strategy Candidate Search
    │    │   ├─ resolveGeo() → Grid-based Proximity Search
    │    │   ├─ resolveDestination() → Trinity Intersection
    │    │   ├─ makeMatchDecision() → 8 Rules
    │    │   ├─ executeDecision() → AUTO_MATCH / CREATE_NEW / REVIEW
    │    │   └─ upsertFactDelivery() / enqueueReview()
    │    │
    │    ├─ flushBatches_() → บันทึกทั้งหมดลง Sheet
    │    └─ autoEnrichAliasesFromFactBatch_() → Single Writer M_ALIAS
    │
    └─ Time Guard: ถ้า > 5 นาที → saveCheckpoint_() + installAutoResume_()
```

### 9.2 Group 2: Daily Ops Flow

```
onOpen() → เมนู "ดึงข้อมูล SCG"
    │
    ▼ ผู้ใช้กด
fetchDataFromSCGJWD() → ดึงข้อมูลจาก SCG API
    │
    ├─ fetchWithRetry_() → API call (Cookie-based auth)
    ├─ flatten ข้อมูลลง ตารางงานประจำวัน
    ├─ buildOwnerSummary() → สรุปตาม SoldToName
    └─ buildShipmentSummary() → สรุปตาม ShipmentNo+Truck
    │
    ▼ ผู้ใช้กด "Run Full Pipeline" (หรือ auto)
applyMasterCoordinatesToDailyJob()
    │
    └─ runLookupEnrichment() → ค้นหาพิกัด (17_SearchService)
         ├─ findBestGeoByPersonPlace() → 2-Tier Search (ShipToName-Only)
         │   ├─ Tier 0: fastLookupByShipToName() → M_ALIAS Fast Track
         │   ├─ Tier 1: resolvePerson() → getDestsByPersonId() (usage-dominant)
         │   └─ NOT_FOUND: เว้นว่าง — ไม่มี fallback
         └─ เขียน LatLong_Actual + ระบายสี (Green/Red)
```

### 9.3 Review Decision Flow

```
onEdit() → ตรวจจับการเปลี่ยนแปลงใน Q_REVIEW
    │
    ▼ ผู้ใช้เลือก Decision
applyReviewDecision()
    │
    ├─ CREATE_NEW → สร้าง Person/Place/Geo/Destination ใหม่ + upsertFactDelivery
    ├─ MERGE_TO_CANDIDATE → ใช้ Candidate เดิม + upsertFactDelivery
    ├─ IGNORE → ทำเครื่องหมายว่าไม่สนใจ
    └─ ESCALATE → เปลี่ยน Priority เป็น 1 (สูงสุด) รอผู้บริหารตรวจสอบ
```

---

## 10. Caching Strategy

### 10.1 3-Layer Cache Architecture

```
┌─────────────────────────────────────────────┐
│ Layer 1: RAM (Global Variables)             │
│   _GLOBAL_GEO_DICT_CACHE                    │
│   _GLOBAL_GEO_DICT_PROVINCE_INDEX           │
│   _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX         │
│   _GLOBAL_GEO_POINTS_CACHE                  │
│   _GLOBAL_GEO_DICT_CACHE_PLACE              │
│   _SOURCE_ROWS_RAM_CACHE                    │
│   _PERSON_NOTE_INVERTED_INDEX               │
│   _LOG_BUFFER (50 entries batch)            │
│   → เร็วสุด แต่หายเมื่อ script จบ           │
│   → ใช้สำหรับข้อมูลที่อ่านบ่อยภายใน execution│
├─────────────────────────────────────────────┤
│ Layer 2: CacheService (Script Cache)        │
│   TTL: 6 ชั่วโมง (21,600 วินาที)           │
│   → แชร์ข้าม execution                      │
│   → Chunked สำหรับข้อมูลใหญ่ (>100KB)      │
│   → ใช้สำหรับ GEO Dictionary, Source Rows  │
│   → M_PERSON_ALL, M_GEO_ALL, M_DEST_ALL    │
│     (chunked 200 items/chunk)               │
├─────────────────────────────────────────────┤
│ Layer 3: Sheet (Google Sheets)              │
│   MAPS_CACHE, SYS_TH_GEO, etc.             │
│   → ถาวร แต่ช้าที่สุด                       │
│   → ใช้สำหรับข้อมูลที่ต้องเก็บถาวร          │
└─────────────────────────────────────────────┘
```

### 10.2 Cache Keys

| Cache Key | ข้อมูล | TTL | Chunked |
|-----------|--------|-----|---------|
| `CACHE_KEY_SOURCE` | Source rows (unprocessed) | 21,600s | Yes (v5.5.003) |
| `CACHE_KEY_INVOICES` | Invoice set from FACT | 21,600s | Yes (v5.5.003) |
| `M_PERSON_ALL` | All persons data | 21,600s | Yes (200 items/chunk) |
| `M_PERSON_ALIAS_ALL` | All person aliases | 21,600s | Yes (200 items/chunk) |
| `M_GEO_ALL` | All geo points | 21,600s | Yes (200 items/chunk) |
| `M_DEST_ALL` | All destinations | 21,600s | Yes (200 items/chunk) |
| `GEO_DICT_POSTCODE_*` | Postcode map (350 keys/chunk) | 21,600s | Yes |
| `GEO_DICT_PROVINCES` | Province set | 21,600s | No |
| `GEO_DICT_DISTRICTS_*` | District map | 21,600s | Yes |
| `GEO_`+MD5 / `RGEO_`+MD5 | Maps API results | 21,600s | No |

### 10.3 Cache Invalidation

`invalidateAllGlobalCaches()` ใน `01_Config.gs` เป็นจุดกลางล้างแคชทั้งหมด — เรียกเมื่อ:
- เปลี่ยนแปลง Schema
- รัน `setupAllSheets()`
- ต้องการ refresh ข้อมูล

ฟังก์ชัน invalidate เฉพาะก็มี:
- `invalidateSourceCache()` — ล้าง source rows cache
- `invalidatePersonCache_()` — ล้าง person cache
- `invalidatePlaceCache_()` / `invalidatePlaceAliasCache_()` — ล้าง place caches
- `invalidateGeoCache_()` — ล้าง geo cache
- `invalidateDestCache_()` — ล้าง destination cache
- `invalidateGeoDictCache()` — ล้าง geo dictionary cache
- `clearMapsCache()` — ล้าง Maps API cache (ลบจาก Sheet + CacheService)

---

## 11. Dependencies Matrix

### 11.1 Module Dependencies

```
01_Config ← (None — root module)
02_Schema ← 01_Config
03_SetupSheets ← 01_Config, 02_Schema, 14_Utils
04_SourceRepository ← 01_Config, 02_Schema, 14_Utils
05_NormalizeService ← 14_Utils
06_PersonService ← 01_Config, 02_Schema, 05_Normalize, 14_Utils, 21_AliasService
07_PlaceService ← 01_Config, 02_Schema, 05_Normalize, 14_Utils, 21_AliasService, 16_GeoDictionary, 20_ThGeoService
08_GeoService ← 01_Config, 02_Schema, 14_Utils, 07_PlaceService, 15_GoogleMapsAPI
09_DestinationService ← 01_Config, 02_Schema, 14_Utils
10_MatchEngine ← 01_Config, 02_Schema, 05_Normalize, 06_Person, 07_Place, 08_Geo, 09_Dest, 11_Transaction, 12_Review, 14_Utils
11_TransactionService ← 01_Config, 02_Schema, 06_Person, 07_Place, 08_Geo, 14_Utils
12_ReviewService ← 01_Config, 02_Schema, 06_Person, 07_Place, 08_Geo, 09_Dest, 11_Transaction, 14_Utils
13_ReportService ← 01_Config, 02_Schema, 06-09 Services, 12_Review
14_Utils ← 01_Config
15_GoogleMapsAPI ← 01_Config, 02_Schema, 14_Utils
16_GeoDictionaryBuilder ← 01_Config, 02_Schema, 05_Normalize, 20_ThGeoService, 14_Utils
17_SearchService ← 01_Config, 02_Schema, 05_Normalize, 14_Utils, 21_AliasService, 06_Person, 07_Place, 09_Dest
18_ServiceSCG ← 01_Config, 02_Schema, 17_SearchService
19_Hardening ← 01_Config, 02_Schema, 05-09 Services, 14_Utils
20_ThGeoService ← 01_Config, 02_Schema, 05_Normalize, 16_GeoDictionary, 14_Utils
21_AliasService ← 01_Config, 02_Schema, 05_Normalize, 06_Person, 07_Place, 09_Dest, 14_Utils
```

### 11.2 Cross-Module Reference Count

| Module | ถูกอ้างอิงโดย | จำนวน |
|--------|-------------|--------|
| `01_Config.gs` | ทุกไฟล์ | 21 |
| `14_Utils.gs` | 15 ไฟล์ | 15 |
| `02_Schema.gs` | 14 ไฟล์ | 14 |
| `05_NormalizeService.gs` | 5 ไฟล์ | 5 |
| `21_AliasService.gs` | 3 ไฟล์ | 3 |

---

## 12. Error Handling & Disaster Prevention

### 12.1 Error Handling Pattern

| ระดับ | รูปแบบ | ตัวอย่าง |
|-------|--------|---------|
| **Entry Point** (เมนู) | `try-catch` + `logError()` + `safeUiAlert_()` | `runFullPipeline()`, `fetchDataFromSCGJWD()` |
| **Pipeline Core** | Throw → catch ที่ Entry Point | `processOneRow()` ไม่มี try-catch ให้ catch ที่ `runMatchEngine()` |
| **Utility** (pure function) | ไม่ต้อง try-catch (ถ้า pure) | `diceCoefficient()`, `normalizeForCompare()` |
| **External API** | `callSpreadsheetWithRetry()` + exponential backoff | การเขียน Sheet ที่อาจ rate-limited |

### 12.2 `safeUiAlert_()` (V5.4.002)

ฟังก์ชัน `safeUiAlert_()` ใน `14_Utils.gs` เป็น consolidated UI alert ที่มี guard ตรวจสอบว่า `SpreadsheetApp.getUi()` พร้อมใช้งานหรือไม่ ถ้าไม่พร้อม (เช่น รันจาก Timer Trigger) จะข้ามการแสดง alert และ log เฉยๆ แทน ฟังก์ชันนี้รวม `safeAlert_()` (เดิมใน 16_GeoDictionaryBuilder) และ `safeUiAlert_Report_()` (เดิมใน 13_ReportService) มาไว้ที่เดียว

### 12.3 SYS_LOG Auto-Clean

ระบบ Logging มี auto-clean mechanism ที่ `clearOldLogs_()` — ลบแถวเก่าเมื่อ SYS_LOG เกิน 5,000 แถว ป้องกันชีตบวมจนกระทบประสิทธิภาพ

### 12.4 LockService

Pipeline ใช้ `LockService.getScriptLock()` เพื่อป้องกันการรันพร้อมกัน (concurrent execution) ที่อาจทำให้ข้อมูลเสียหาย

---

## 13. Configuration & Schema System

### 13.1 Config System (`01_Config.gs`)

**APP_VERSION** = `'5.5.006'`, **SCHEMA_VERSION** = `'5.5.006'`

**SHEET Object** (frozen, 20 entries):
```javascript
var SHEET = Object.freeze({
  SOURCE: 'SCGนครหลวงJWDภูมิภาค',
  DAILY_JOB: 'ตารางงานประจำวัน',
  M_PERSON: 'M_PERSON',
  M_PERSON_ALIAS: 'M_PERSON_ALIAS',
  M_PLACE: 'M_PLACE',
  M_PLACE_ALIAS: 'M_PLACE_ALIAS',
  M_ALIAS: 'M_ALIAS',
  M_GEO_POINT: 'M_GEO_POINT',
  M_DESTINATION: 'M_DESTINATION',
  FACT_DELIVERY: 'FACT_DELIVERY',
  Q_REVIEW: 'Q_REVIEW',
  SYS_CONFIG: 'SYS_CONFIG',
  SYS_LOG: 'SYS_LOG',
  SYS_TH_GEO: 'SYS_TH_GEO',
  RPT_QUALITY: 'RPT_DATA_QUALITY',
  MAPS_CACHE: 'MAPS_CACHE',
  INPUT: 'Input',
  EMPLOYEE: 'ข้อมูลพนักงาน',
  OWNER_SUMMARY: 'สรุป_เจ้าของสินค้า',
  SHIPMENT_SUM: 'สรุป_Shipment'
});
```

**Index Constant Sets** (17 sets, all frozen):
- `PERSON_IDX` (10), `PERSON_ALIAS_IDX` (6), `PLACE_IDX` (14), `PLACE_ALIAS_IDX` (6), `ALIAS_IDX` (8), `GEO_IDX` (14), `DEST_IDX` (11), `FACT_IDX` (32), `REVIEW_IDX` (22), `TH_GEO_IDX` (16), `EMPLOYEE_IDX` (8), `SRC_IDX` (37), `DATA_IDX` (29), `SYS_LOG_IDX` (6), `MAPS_CACHE_IDX` (10), `OWNER_SUM_IDX` (6), `SHIPMENT_SUM_IDX` (7)

**AI_CONFIG** (13 match parameters):
- `THRESHOLD_AUTO` = 90, `THRESHOLD_REVIEW` = 70, `THRESHOLD_IGNORE` = 50, `SCORE_MIN_THRESHOLD` = 60, `PLACE_SCORE_MIN` = 55, `MODEL` = 'gemini-1.5-flash', `BATCH_SIZE` = 20, `RETRIEVAL_LIMIT` = 50, `CACHE_TTL_SEC` = 21600, `GEO_RADIUS_M` = 50, `GEO_GRID_SIZE` = 0.01, `USE_AI_REASONING` = false, `TIME_LIMIT_MS` = 300000

**SCG_CONFIG** (10 API parameters):
- API URL, Cookie format, E-POD owners, etc.

**APP_CONST** (13 status/color/match constants):
- Match statuses, colors, action types, etc.

### 13.2 Schema System (`02_Schema.gs`)

**SCHEMA Object** (frozen, 20 sheet schemas):
- แต่ละ schema เป็น array ของ column header names
- `validateSchemaConsistency()` ตรวจสอบว่า schema ตรงกับ IDX constants
- `getColIndex(schemaKey, colName)` สำหรับ dynamic column lookup
- `validateSheetHeaders()` ตรวจสอบว่า headers ในชีตจริงตรงกับ schema

### 13.3 Schema-Config-Setup Triangle

```
01_Config.gs (IDX constants) ←→ 02_Schema.gs (SCHEMA headers) ←→ 03_SetupSheets.gs (create sheets)
        ↑                              ↑                                    ↑
        └──── ต้องอัปเดตพร้อมกันทุกครั้ง ────┘                                    │
                    validateSchemaConsistency() ←────────────────────────────┘
```

กฎสำคัญ: ทุกการเปลี่ยนแปลง Schema ต้องอัปเดตทั้ง 3 ไฟล์พร้อมกัน — ถ้าอัปเดตไม่ครบ ระบบจะผิดพลาดได้

---

## 14. Search Service — ShipToName-Only Policy (V5.4.003)

> **[REDESIGN v5.4.003]** Search Service ถูกปรับโครงสร้างใหม่ทั้งหมดตาม **ShipToName-Only Policy** — ลบ ShipToAddress, LatLong_SCG, และ AI Reasoning ออกจาก logic ทั้งหมด เหลือเพียง 2 Tier ที่ใช้ ShipToName เป็น key เดียว

### 14.1 เหตุผลที่ต้องเปลี่ยน

| ข้อมูล | ปัญหา | ผลกระทบ |
|--------|-------|---------|
| `ShipToAddress` | ไม่น่าเชื่อถือ — อาจมีแค่อำเภอ, สะกดผิด, หรือไม่ครบ | จับคู่ผิดไปจุดอื่น |
| `LatLong_SCG` | อิงจาก ShipToAddress ที่ไม่ reliable | พิกัดผิด cascade ผิดต่อ |
| AI Reasoning | คาดเดาพิกัดโดยไม่มีหลักฐานจริง | ไม่เหมาะ production |

### 14.2 Search Tier ปัจจุบัน (2 Tier Only)

| Tier | ชื่อ | กลไก | ความเร็ว |
|------|------|------|----------|
| Tier 0 | **M_ALIAS Fast Track** | `ShipToName` → normalize → M_ALIAS reverse index → `masterUuid` → `personId`/`placeId` → `M_DESTINATION` → `lat,lng` | O(1) |
| Tier 1 | **Person Anchor** | `ShipToName` → `resolvePerson()` → `getDestsByPersonId()` → sort by `usageCount` → destination ที่ใช้บ่อยสุด | O(N) |
| — | **NOT_FOUND** | ไม่พบ ShipToName ใน Master/Alias ทั้งหมด | — |

### 14.3 Color Coding (ผลลัพธ์ในชีตรายวัน)

| สี | ความหมาย | เงื่อนไข |
|-----|---------|---------|
| เขียว `#b6d7a8` | พบพิกัดจาก Master | FOUND_ALIAS_FAST หรือ FOUND_DOMINANT |
| แดง `#f4cccc` | ไม่พบพิกัด | NOT_FOUND — ยังไม่มีข้อมูลใน Master |

### 14.4 Flow การค้นหาพิกัด (ShipToName Only)

```text
ตารางงานประจำวัน row
  ↓
อ่านเฉพาะ ShipToName (DATA_IDX.SHIP_TO_NAME)
  ↓
Tier 0: fastLookupByShipToName(ShipToName)
  ├── เจอ → lat,lng (FOUND_ALIAS_FAST)
  └── ไม่เจอ ↓
Tier 1: resolvePerson(ShipToName) → getDestsByPersonId(personId)
  ├── เจอ personId → sort by usageCount → top destination
  │   ├── เจอ destination → lat,lng (FOUND_DOMINANT)
  │   └── ไม่เจอ destination → NOT_FOUND
  └── ไม่เจอ personId → NOT_FOUND
  ↓
NOT_FOUND → เว้นว่าง LatLong_Actual + สีแดง
```

### 14.5 สิ่งที่ถูกลบออกจาก Search Service (V5.4.003)

| อัน | เหตุผล |
|-----|--------|
| Tier A: Person+Place (ใช้ ShipToAddress) | ShipToAddress ไม่ reliable |
| Tier B: Place Only (ใช้ ShipToAddress) | ไม่ใช้ ShipToAddress |
| Tier D: SCG API Fallback | อิงจาก ShipToAddress โดยอ้อม |
| Tier E: AI Reasoning | คาดเดาพิกัด ไม่เหมาะ production |
| `callGeminiReasoning_()` | ลบฟังก์ชัน AI reasoning ออก |
| Fallback ทุกประเภท | หาไม่เจอ = เว้นว่าง ไม่เดา |

### 14.6 Tier 0 Fast Track Detail

Tier 0 ใช้ `fastLookupByShipToName()` ใน `21_AliasService.gs`:
1. Normalize ShipToName ด้วย `normalizeForCompare()`
2. ค้นหาใน Global Alias Reverse Index (variant → {masterUuid, entityType}[])
3. ถ้าพบ → แปลง masterUuid → entityId (ผ่าน `convertUuidToPersonId()` หรือ `convertUuidToPlaceId()`)
4. หา Destination จาก entityId → lat, lng
5. คืนผลทันทีโดยไม่ต้องผ่าน Tier อื่น

---

## 15. Migration Guide

### 15.1 Hybrid Alias Migration (V5.4)

Migration ใช้ `MIGRATION_HybridAliasSystem()` ใน `21_AliasService.gs` มี 5 ขั้นตอน:

| ขั้น | ชื่อ | งาน | ประมาณการเวลา |
|------|------|-----|-------------|
| 1 | **Assign UUID** | ตรวจสอบและกำหนด `master_uuid` ให้ M_PERSON และ M_PLACE ที่ยังไม่มี | 1-2 นาที |
| 2 | **Person Alias → M_ALIAS** | อ่าน M_PERSON_ALIAS ทั้งหมด → สร้าง M_ALIAS entries (entity_type=PERSON) | 2-5 นาที |
| 3 | **Place Alias → M_ALIAS** | อ่าน M_PLACE_ALIAS ทั้งหมด → สร้าง M_ALIAS entries (entity_type=PLACE) | 2-5 นาที |
| 4 | **Canonical Names → M_ALIAS** | อ่าน canonical_name จาก M_PERSON และ M_PLACE → สร้าง M_ALIAS entries (confidence=100) | 1-3 นาที |
| 5 | **Build Reverse Index** | สร้าง Global Alias Reverse Index สำหรับ Tier 0 Fast Track | <1 นาที |

### 15.2 Migration Safety

- **Time Guard**: V5.4.002 เพิ่ม `hasTimePassed_()` ทุก 100 รายการ — ถ้าใกล้ timeout จะบันทึก checkpoint
- **Checkpoint Resume**: `saveMigrationCheckpoint_()` / `loadMigrationCheckpoint_()` — ใช้ PropertiesService เก็บขั้นตอนปัจจุบัน
- **Batch Write**: `batchAppendToAliasSheet_()` เขียน M_ALIAS แบบ batch แทนที่จะใช้ `appendRow()` ทีละแถว (ลด API calls จาก O(N) เป็น O(N/20))
- **Idempotent**: Migration สามารถรันซ้ำได้โดยไม่ทำให้ข้อมูลเสีย — dedup key ป้องกัน alias ซ้ำ

### 15.3 Pre-Migration Checklist

- [ ] M_PERSON มีคอลัมน์ `master_uuid` (col 9)
- [ ] M_PLACE มีคอลัมน์ `master_uuid` (col 13)
- [ ] M_ALIAS ชีตถูกสร้างแล้ว (8 คอลัมน์)
- [ ] M_PERSON_ALIAS และ M_PLACE_ALIAS มีข้อมูลอยู่
- [ ] รัน `checkSystemIntegrity()` ผ่าน

---

## 16. Single Writer Pattern (V5.5.001)

### 16.1 หลักการ

**M_ALIAS ถูกเขียนจากจุดเดียวใน Pipeline** — `autoEnrichAliasesFromFactBatch_()` ใน `10_MatchEngine.gs` เป็นจุดเขียน M_ALIAS จุดเดียวใน Pipeline อัตโนมัติ การเขียนจากที่อื่น (Migration/Admin) ต้องผ่าน `21_AliasService.gs` เท่านั้น

### 16.2 Write Path Map

| ตาราง | Pipeline Writer | Admin/Migration Writer | ห้ามเขียนจาก |
|--------|----------------|----------------------|-------------|
| M_ALIAS | `autoEnrichAliasesFromFactBatch_()` (10_MatchEngine.gs) | `createGlobalAlias()` (21_AliasService.gs) | 06, 07, 18, 19 |
| M_PERSON_ALIAS | `autoEnrichAliasesFromFactBatch_()` (10_MatchEngine.gs) | `createPersonAlias()` (06_PersonService.gs) | 18, 19 |
| M_PLACE_ALIAS | `autoEnrichAliasesFromFactBatch_()` (10_MatchEngine.gs) | `createPlaceAlias()` (07_PlaceService.gs) | 18, 19 |

### 16.3 สิ่งที่ถูกลบ (V5.4.001–002)

| ฟังก์ชัน | สาเหตุที่ลบ |
|----------|-----------|
| `syncAliasToEntityTable_()` | Circular Dependency: createGlobalAlias() → syncAliasToEntityTable_() → createPersonAlias() → createGlobalAlias() วนลูป |
| `populateAliasFromSCGRawData_()` (ใน 18_ServiceSCG.gs) | Single Writer Violation: Group 2 เขียน M_ALIAS โดยตรง ไม่ผ่าน Pipeline |

---

## 17. Bug Status & Improvement History

### 17.1 V5.4.002 Bug Fixes (7 รายการ — แก้แล้วทั้งหมด)

| ID | ระดับ | รายละเอียด | วิธีแก้ | ไฟล์ที่แก้ |
|----|--------|-----------|---------|-----------|
| C1 | CRITICAL | Single Writer Violation — `populateAliasFromSCGRawData_()` เขียน M_ALIAS จากนอก Pipeline | ลบออกจาก Group 2 pipeline | 18_ServiceSCG.gs |
| C4 | CRITICAL | MIGRATION ไม่มี Time Guard — อาจ timeout กลางคันกับข้อมูลใหญ่ | เพิ่ม hasTimePassed_, saveMigrationCheckpoint_(), batchAppendToAliasSheet_() | 21_AliasService.gs |
| F1 | HIGH | Fake Function Call — `autoInstallSmartNav_()` ไม่มีอยู่จริง ทำให้ error เมื่อเรียก | สร้างฟังก์ชันจริง | 00_App.gs |
| H1 | HIGH | Hardcode Index ใน `18_ServiceSCG.gs` — 8 จุดใช้เลขคอลัมน์ตรง (r[28], r[14], r[16] ฯลฯ) | เปลี่ยนเป็น `DATA_IDX.*` constants | 18_ServiceSCG.gs |
| D1 | MEDIUM | Duplicate Function — `loadCachedGeoRows_()` ซ้ำใน 07_PlaceService.gs ทำให้ GAS ใช้ตัวสุดท้ายที่โหลด | ลบออกจาก 07_PlaceService ใช้จาก 16_GeoDictionaryBuilder.gs | 07_PlaceService.gs |
| P1 | HIGH | Performance — `updateDestinationStats` ใช้ setValue ทีละแถว ทำให้ช้ากับข้อมูลมาก | เปลี่ยนเป็น batch setValues | 09_DestinationService.gs |
| C2 | MEDIUM | Consolidate safeAlert — `safeAlert_()` + `safeUiAlert_()` + `safeUiAlert_Report_()` กระจายอยู่หลายไฟล์ | รวมเป็น `safeUiAlert_()` ใน `14_Utils.gs` | 14_Utils.gs, 16, 13 |

### 17.2 V5.5.001 Bug Fixes (22 ไฟล์ — BUGHUNT+REVIEW15+REFACTOR+PREDEPLOY ครบถ้วน)

| ID | ระดับ | ไฟล์ | รายละเอียด | วิธีแก้ |
|----|--------|------|-----------|---------|
| V55-01 | HIGH | 11_TransactionService | Falsy-value Bug `\|\|` fallback ทับค่าว่าง | `!= null` ternary |
| V55-02 | HIGH | 11_TransactionService | `upsertFactDelivery()` ไม่มี try-catch | เพิ่ม wrapper |
| V55-03 | HIGH | 11_TransactionService | `getGeoLatLng_()` โหลด sheet ทุกครั้ง | เพิ่ม RAM Cache |
| V55-04 | HIGH | 15_GoogleMapsAPI | `getFromSheetCache_()` อ่านทั้งชีต+เขียน hit_count | RAM Cache + Batch hit_count |
| V55-05 | HIGH | 17_SearchService | `runLookupEnrichment()` ไม่มี try-catch | เพิ่ม + flush ก่อน throw |
| V55-06 | HIGH | 18_ServiceSCG | Hardcoded sheet names | `SHEET.*` constants |
| V55-07 | HIGH | 18_ServiceSCG | `getUi().alert()` crash on trigger | `safeUiAlert_()` |
| V55-08 | HIGH | 10_MatchEngine | REVIEW rows สร้าง GeoPoint | Guard skip REVIEW |
| V55-09 | HIGH | 10_MatchEngine | `getEnrichedGeoData()` ทุก row | Guard เฉพาะ AUTO/CREATE |
| V55-10 | HIGH | 16_GeoDictionaryBuilder | Hardcoded column `4` | `SCHEMA[*].length` |
| V55-11 | HIGH | 16_GeoDictionaryBuilder | `invalidateGeoDictCache` ลบแค่ 10 chunks | Dynamic chunk count |
| V55-12 | HIGH | 20_ThGeoService | ไม่ใช้ searchKey column | searchKey-based matching |
| V55-13 | HIGH | 20_ThGeoService | First exact match ผิดจังหวัด | Province disambiguation |
| V55-14 | HIGH | 21_AliasService | `createGlobalAlias` ใช้ `appendRow` | `getRange+setValues` |
| V55-15 | MEDIUM | 01_Config | `PLACE_ALIAS_IDX` หายจาก validateConfig | เพิ่ม |
| V55-16 | MEDIUM | 09_DestinationService | ไม่มี Math.min guard | เพิ่ม |
| V55-17 | MEDIUM | 09_DestinationService | เก็บ 0,0 สำหรับ invalid coords | เปลี่ยนเป็น `''` |
| V55-18 | MEDIUM | 12_ReviewService | `enqueueReview()` เรียก Maps API | try-catch + skip |
| V55-19 | MEDIUM | 19_Hardening | `fixMissingSyncStatus()` ไม่มี try-catch | เพิ่ม |
| V55-20 | MEDIUM | 04_SourceRepository | `getAllSourceRows()` ไม่มี try-catch | เพิ่ม |
| V55-21 | MEDIUM | 03_SetupSheets | `clearOldLogs_` recursive risk | Guard flag + console.log |
| V55-22 | MEDIUM | 07_PlaceService | อ่านทั้งชีต + dead code | Cache + ลบ dead code |

### 17.3 V5.5.002 CRITICAL Fix Cycle (8 Issue — แก้แล้วทั้งหมด)

| ID | ระดับ | ไฟล์ | รายละเอียด | วิธีแก้ | Verify |
|----|--------|------|-----------|---------|--------|
| CRIT-001 | CRITICAL | 11_TransactionService | `resolvedLat`/`resolvedLng` เริ่มต้นด้วย `0` → พิกัดถูกต้องถูกเขียนทับด้วย 0 ใน UPDATE path | เปลี่ยน init เป็น `null`, fallback `===null`, UPDATE `!==null`, INSERT `null→0` | ✅ Confirmed |
| CRIT-002 | CRITICAL | 12_ReviewService | `executeReviewCreateNew_` ไม่เก็บ return value จาก `upsertFactDelivery` → INSERT row สูญหาย | เก็บ `factResult` + เขียน INSERT row ทันที + invalidate cache | ✅ Confirmed |
| CRIT-003 | CRITICAL | 12_ReviewService | `MERGE_TO_CANDIDATE` ไม่เรียก `upsertFactDelivery` → Data Loss | สร้าง srcObj + resolve geo/dest + เรียก upsert + เขียน INSERT row | ✅ Confirmed |
| CRIT-004 | CRITICAL | 21_AliasService | `MIGRATION_HybridAliasSystem()` ใช้ `sourceSheet` (undefined) → checkpoint logic ผิด | เปลี่ยนเป็น `sourceSheetForCheck = ss.getSheetByName(SHEET.SOURCE)` | ✅ Confirmed |
| CRIT-005 | CRITICAL | 10_MatchEngine | Entity ใหม่จาก `handleCreateNew_` ไม่เข้า alias enrichment context → stale cache | เพิ่ม `addEntityToEnrichmentContext_()` + เรียกหลัง createPerson/createPlace | ✅ Confirmed |
| CRIT-006 | CRITICAL | 12_ReviewService | `applyAllPendingDecisions()` ไม่มี LockService → Race Condition | เพิ่ม `LockService.getScriptLock()` + `tryLock()` + `releaseLock()` in finally | ✅ Confirmed |
| CRIT-007 | CRITICAL | 19_Hardening | `flushGlobalAliasRows_` เขียนตรงลง M_ALIAS → ละเมิด Single Writer Pattern | เปลี่ยนเป็นเรียก `createGlobalAlias()` ต่อแถว | ✅ Confirmed |
| CRIT-008 | CRITICAL | 04_SourceRepository | `getProcessedInvoiceSet_` ใช้ `cache.put` ตรง → เกิน 100KB fail เงียบ | เพิ่ม chunked cache pattern (CHUNK_SIZE=200) + invalidate chunk keys | ✅ Confirmed |

### 17.4 ปัญหาที่ทราบ (ยังไม่ได้แก้)

| ID | ระดับ | รายละเอียด | สถานะ |
|----|--------|-----------|--------|
| NS-1 | MEDIUM | 0/22 ไฟล์ใช้ Object Namespace Pattern | Open |
| GS-1 | MEDIUM | 19 global variables ใน 4 ไฟล์ | Open |
| SC-1 | LOW | SCG Cookie เป็น plaintext ใน SYS_CONFIG | Open |

### 17.4 ประวัติการพัฒนา (V4.0 → V5.5.001)

| เวอร์ชัน | ช่วงเวลา | การเปลี่ยนแปลงสำคัญ |
|----------|----------|-------------------|
| V4.0 | 2025-Q4 | ระบบเริ่มต้น: NameMapping, Hardcode Index, appendRow, 17 โมดูล |
| V5.2.001 | 2026-Q1 | แยก Load/Match, Regex fix, COMPANY_SUFFIX sort |
| V5.2.003 | 2026-Q1 | Auto-Trigger Resume, SYS_TH_GEO corrected |
| V5.2.007 | 2026-Q1 | Checkpoint index → SYNC_STATUS |
| V5.2.008 | 2026-Q1 | 16-column Geo Dictionary, Plus Code fallback |
| V5.2.010 | 2026-Q1 | Auto Alias generation from history |
| V5.2.011 | 2026-Q1 | Smart Navigation (onSelectionChange) |
| V5.2.012 | 2026-Q1 | Batch SCG API mode |
| V5.2.015 | 2026-Q1 | callSpreadsheetWithRetry, Lock fix |
| V5.2.016 | 2026-Q1 | normalizeInvoiceNo (e-notation fix) |
| V5.4.001 | 2026-05-24 | Hybrid Alias Architecture, M_ALIAS, Single Writer Pattern, 22 โมดูล |
| V5.4.002 | 2026-05-26 | แก้ 7 Bug สำคัญ, Hardcode Index → DATA_IDX, safeUiAlert_ consolidated |
| V5.4.003 | 2026-05-28 | BUGHUNT Round 2-3, REVIEW15 16 Immutable Laws, REFACTOR-01~06 SRP Split, ShipToName-Only Policy |
| V5.5.001 | 2026-06-04 | แก้ Bug 22 ไฟล์ทั้งหมด — BUGHUNT+REVIEW15+REFACTOR+PREDEPLOY ครบ, เพิ่ม RAM Cache, SearchKey matching, Falsy-value Bug, try-catch ทุก Entry Point |
| V5.5.002 | 2026-06-11 | CRITICAL Fix Cycle — 8 Issue สำคัญ: Null-safe coordinates, Silent Data Loss ใน Review, LockService concurrency, Single Writer compliance, Chunked Cache |
| V5.5.004 | 2026-06-11 | Security Fix Cycle — 7 ช่องโหว่ (3 HIGH, 4 MEDIUM): Cookie → ScriptProperties, Authorization Guard, Cookie Sanitization, PII Log Removal, Protected Ranges, API Key Header, Email Masking |

---

## 18. Performance Analysis

### 18.1 ปัญหา Performance ที่ทราบ

| ระดับ | ปัญหา | ตำแหน่ง | ผลกระทบ | สถานะ |
|--------|-------|---------|----------|--------|
| CRITICAL | applyAllPendingDecisions ไม่มี Time Guard | 12_ReviewService.gs | Timeout กับ Q_REVIEW ใหญ่ | ✅ Fixed (v5.5.002) |
| CRITICAL | Migration appendRow per alias | 21_AliasService.gs | O(N) API calls | ✅ Fixed (v5.5.001) |
| HIGH | setValue in for loop (Maps cache hit_count) | 15_GoogleMapsAPI.gs | ช้าเมื่อ cache ใหญ่ | ✅ Fixed (v5.5.001) |
| HIGH | 5x setValue per review decision | 12_ReviewService.gs | 5 API calls ต่อ decision | ✅ Fixed (v5.4.002) |
| HIGH | updatePersonStats/PlaceStats/GeoStats ทีละแถว | 06/07/08/09 Services | 3 API calls each | ✅ Fixed (v5.5.003 — Batch Stats) |
| HIGH | Maps cache reads entire sheet every call | 15_GoogleMapsAPI.gs | ช้ามาก | ✅ Fixed (v5.5.001) |
| HIGH | getGeoLatLng_ loads M_GEO_POINT per call | 11_TransactionService.gs | O(N) sheet reads | ✅ Fixed (v5.5.001) |
| HIGH | FACT_DELIVERY written one row at a time in Review | 12_ReviewService.gs | O(N) API calls | ✅ Fixed (v5.5.003 — PERF-002) |
| HIGH | createGlobalAlias() per row in Hardening | 19_Hardening.gs | ~400-600 calls | ✅ Fixed (v5.5.003 — PERF-003) |
| MEDIUM | Non-chunked CacheService put | 06/08/09 Services | >100KB fail | ✅ Fixed (v5.5.003 — PERF-004) |
| MEDIUM | O(N) scan with diceCoefficient per row | 16_GeoDictionaryBuilder | ช้าเมื่อข้อมูลเยอะ | ✅ Fixed (v5.5.003 — PERF-005) |
| MEDIUM | O(N) full dictionary scan | 20_ThGeoService | ช้าเมื่อข้อมูลเยอะ | ✅ Fixed (v5.5.003 — PERF-006) |
| MEDIUM | Invalidate entire RAM cache after every batch | 04_SourceRepository | ต้องอ่าน Sheet ใหม่ทั้งหมด | ✅ Fixed (v5.5.003 — PERF-007) |
| MEDIUM | Direct M_ALIAS sheet read bypassing cache | 10_MatchEngine | ช้า, bypass cache | ✅ Fixed (v5.5.003 — PERF-008) |
| MEDIUM | Direct sheet read bypassing cache | 16_GeoDictionaryBuilder | ช้า, bypass cache | ✅ Fixed (v5.5.003 — PERF-009) |
| LOW | O(N×M) note search scan | 06_PersonService | ช้าเมื่อ Note เยอะ | ✅ Fixed (v5.5.003 — PERF-010) |
| LOW | getDataRange() reads more than needed | 20_ThGeoService | Over-read | ✅ Fixed (v5.5.003 — PERF-011) |
| LOW | appendRow() per log entry | 03_SetupSheets | O(N) API calls | ✅ Fixed (v5.5.003 — PERF-012) |

### 18.2 Time Guard Coverage

| ฟังก์ชัน | มี Time Guard? | มี Auto-Resume? |
|----------|---------------|----------------|
| `runMatchEngine()` | ✅ Yes | ✅ Yes |
| `MIGRATION_HybridAliasSystem()` | ✅ Yes (v5.4.002) | ✅ Yes |
| `fetchDataFromSCGJWD()` | ✅ Yes (batch mode) | ❌ No |
| `applyAllPendingDecisions()` | ✅ Yes (v5.5.002) | ❌ No |
| `generatePersonAliasesFromHistory()` | ✅ Yes (v5.5.001) | ❌ No |
| `buildGeoDictionary()` | ❌ No | ❌ No |
| `populateGeoMetadata()` | ❌ No | ❌ No |
| `runLookupEnrichment()` | ❌ No | ❌ No |

### 18.3 แนวทางปรับปรุง Performance (3 Phase)

| Phase | ระยะเวลา | งานหลัก |
|-------|----------|--------|
| Phase 1 | สัปดาห์ที่ 1-2 | เพิ่ม Time Guard ให้ 5 ฟังก์ชันที่ขาด, แก้ setValue→batch setValues |
| Phase 2 | สัปดาห์ที่ 3-4 | ย้าย constants ที่กระจายอยู่เข้า 01_Config, สร้าง utility functions |
| Phase 3 | สัปดาห์ที่ 5-6 | Split ฟังก์ชันยาว, เพิ่ม Object Namespace, ลด nested loops |

---

## 23. Security Architecture (V5.5.004 → V5.5.006 — historical Security Fix Cycle, now post-Consistency-Sync)

> **วันที่:** 2026-06-11 | **ไฟล์ที่แก้:** 8 ไฟล์ | **ผล:** 7/7 ✅ FIX_CONFIRMED

### 23.1 Security Audit Cycle

| Phase | Command | ผล |
|-------|---------|-----|
| ตรวจสอบช่องโหว่ | `[CMD: FIRST_AUDIT_SECURITY]` | พบ 7 ช่องโหว่ (3 HIGH, 4 MEDIUM) |
| วางแผนแก้ไข | `[CMD: FIX_SECURITY_PLAN]` | แผนแก้ไข 7 รายการ + 8 ไฟล์ |
| ดำเนินการแก้ไข | `[CMD: APPLY_SECURITY_FIX]` | แก้ไขครบทุกรายการ |
| ยืนยันผลแก้ไข | `[CMD: VERIFY_SECURITY_FIX]` | 7/7 ✅ FIX_CONFIRMED, ไม่พบ Regression |

### 23.2 Security Fixes Summary

| SEC ID | ช่องโหว่ | Severity | Fix | ไฟล์หลัก |
|--------|----------|----------|-----|----------|
| SEC-001 | Cookie ใน Spreadsheet Cell | 🔴 HIGH | Cookie → PropertiesService | `18_ServiceSCG.gs` |
| SEC-002 | ไม่มี Authorization Guard | 🔴 HIGH | `isAuthorizedUser_()` 6 Entry Points | `14_Utils.gs` |
| SEC-003 | ไม่มี Cookie Sanitization | 🟡 MEDIUM | `sanitizeCookie_()` CRLF Prevention | `18_ServiceSCG.gs` |
| SEC-004 | PII ใน Log Output | 🟡 MEDIUM | ลบ Response Preview, เก็บเฉพาะ Length | `18_ServiceSCG.gs` |
| SEC-005 | ไม่มี Protected Ranges | 🔴 HIGH | `applySheetProtection_UI()` 4 Sheets | `19_Hardening.gs` |
| SEC-006 | API Key ใน URL | 🟡 MEDIUM | `?key=` → `x-goog-api-key` Header | `14_Utils.gs` |
| SEC-007 | Reviewer Email ไม่ Mask | 🟡 MEDIUM | `maskReviewerEmail_()` | `12_ReviewService.gs` |

### 23.3 Security Architecture Layer

```
┌─────────────────────────────────────────────────────────────┐
│                  LMDS V5.5 Security Layer                    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Layer 1: Secret Management                          │     │
│  │  • SCG_COOKIE → ScriptProperties                    │     │
│  │  • GEMINI_API_KEY → ScriptProperties + Regex Check  │     │
│  │  • LMDS_ADMINS → ScriptProperties                   │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Layer 2: Authorization (Least Privilege)             │     │
│  │  • isAuthorizedUser_() — 6 Destructive Entry Points │     │
│  │  • Backward Compatible (no LMDS_ADMINS = allow all) │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Layer 3: Data Minimization                           │     │
│  │  • sanitizeCookie_() — CRLF Injection Prevention    │     │
│  │  • maskReviewerEmail_() — s***i@company.com         │     │
│  │  • PII Log Removal — Response Length Only           │     │
│  │  • Protected Ranges — EMPLOYEE, SOURCE (hide)       │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 23.4 New Functions Added

| ฟังก์ชัน | ไฟล์ | SEC | จุดประสงค์ |
|----------|------|-----|----------|
| `sanitizeCookie_(raw)` | `18_ServiceSCG.gs:84` | SEC-003 | CRLF Injection Prevention |
| `getSCGCookie_()` | `18_ServiceSCG.gs:289` | SEC-001 | อ่าน Cookie จาก ScriptProperties |
| `setSCGCookie_UI()` | `18_ServiceSCG.gs:236` | SEC-001 | UI ตั้งค่า Cookie → ScriptProperties |
| `isAuthorizedUser_()` | `14_Utils.gs:486` | SEC-002 | ตรวจสอบสิทธิ์ Admin |
| `setupAdminList_UI()` | `14_Utils.gs:523` | SEC-002 | UI ตั้งค่ารายชื่อ Admin |
| `maskReviewerEmail_(email)` | `12_ReviewService.gs:683` | SEC-007 | ปกปิดอีเมลผู้ Review |
| `applySheetProtection_UI()` | `19_Hardening.gs:462` | SEC-005 | ตั้งค่า Protected Ranges |

### 23.5 Known Risks

| # | รายการ | ระดับ | แผนบรรเทา |
|---|--------|-------|----------|
| 1 | `x-goog-api-key` header อาจไม่ทำงานกับ UrlFetchApp | LOW | Fallback → URL param + comment |
| 2 | Protected Ranges บล็อก Script writes จาก non-owner | LOW | เพิ่ม script owner เป็น editor |
| 3 | `sanitizeCookie_()` regex ไม่รองรับ `!` และ `@` | LOW | ความเสี่ยงต่ำสำหรับ SCG Cookie |

---

## 19. Pre-Deploy Checklist

### 19.1 Readiness Assessment (V5.5.006)

| หมวด | ตรวจสอบ | สถานะ |
|------|----------|--------|
| **Phantom Functions** | ไม่มีฟังก์ชันที่เรียกแต่ไม่มีอยู่จริง | ✅ PASS |
| **Duplicate Names** | ไม่มีชื่อฟังก์ชันซ้ำข้ามไฟล์ | ✅ PASS |
| **Header Comments** | ทุกไฟล์มี Dependencies comment | ✅ PASS |
| **TODOs** | ไม่มี TODO ที่ยังไม่ได้จัดการ | ✅ PASS |
| **Batch Operations** | ไม่มี getValue/setValue ในลูป (critical path) | ✅ PASS (v5.5.003) |
| **Hardcoded Indexes** | ไม่มีเลขคอลัมน์ตรงในโค้ด | ✅ PASS (v5.4.002) |
| **Try-Catch** | ทุก entry point มี try-catch | ✅ PASS (v5.5.001) |
| **Time Guard** | ทุก long-running function มี Time Guard | ⚠️ PARTIAL (buildGeoDictionary/populateGeoMetadata ขาด) |
| **Log Buffer Flush** | flushLogBuffer_() ใน finally blocks | ✅ PASS (v5.5.003) |
| **Chunked Cache** | ข้อมูลใหญ่ใช้ chunked cache | ✅ PASS (v5.5.003) |

### 19.2 ขั้นตอนก่อน Deploy

1. รัน `checkSystemIntegrity()` — ตรวจ 20 ชีต + API Key
2. รัน `runPreflightAudit()` — ตรวจ Schema + SYNC_STATUS
3. รัน `diagnoseSystemState()` — วินิจฉัยแบบละเอียด
4. ทดสอบ Pipeline ด้วยข้อมูลจริง 10 รายการ
5. ตรวจสอบ FACT_DELIVERY ว่าข้อมูลถูกต้อง
6. ตรวจสอบ Q_REVIEW ว่า Dropdown ทำงาน
7. ตรวจสอบ M_ALIAS ว่า Auto-Enrich ทำงาน
8. ทดสอบ Smart Navigation
9. ทดสอบ Group 2: ดึงข้อมูล SCG → ใส่พิกัด
10. รัน `buildFullQualityReport()` ตรวจสอบ Match Rate

---

## 20. Production Notes

### 20.1 ข้อจำกัดของ Platform (Google Apps Script)

| ข้อจำกัด | ค่า | วิธีรับมือใน LMDS |
|----------|-----|-----------------|
| Execution Time Limit | 6 นาที (360 วินาที) | Time Guard ที่ 5 นาที + Auto-Resume via Trigger |
| Spreadsheet Read/Write | Rate limited | `callSpreadsheetWithRetry()` + exponential backoff |
| CacheService Limit | 100KB per key | Chunked cache (350 keys/chunk สำหรับ Geo Dictionary) |
| Global Scope | ทุกไฟล์แชร์ scope เดียวกัน | Dependency Map ในหัวไฟล์ + Namespace convention |
| LockService | Script Lock | ป้องกัน concurrent pipeline execution |

### 20.2 ข้อควรระวังเพิ่มเติม

- **SCG Cookie หมดอายุ**: Cookie ที่ใช้ดึงข้อมูล SCG API มีอายุจำกัด ต้องใส่ใหม่ทุกครั้งก่อนดึงข้อมูล
- **E-POD Logic**: เจ้าของสินค้าบางราย (BETTERBE, SCG EXPRESS, เบทเตอร์แลนด์, JWD TRANSPORT, DENSO) ใช้ระบบ E-POD ซึ่งมี logic พิเศษในการนับจำนวน
- **normalizeInvoiceNo**: Invoice จาก SCG บางรายการถูกแปลงเป็น e-notation (เช่น 2.4E+12) ฟังก์ชัน `normalizeInvoiceNo()` จะแก้ไขให้เป็นตัวเลขปกติ
- **1899 Bug**: `formatTimeValue_()` แก้ไขปัญหาเวลาที่แสดงเป็นปี 1899 เนื่องจาก GAS date serial
- **Plus Code Fallback**: ถ้าพิกัด GPS หาย แต่ที่อยู่มี ระบบจะใช้ `lookupPlaceAdminById_()` กู้คืน Province & District จาก M_PLACE ที่เชื่อมอยู่

### 20.3 กฎสำคัญที่ต้องจำ

1. **Single Writer Pattern**: M_ALIAS เขียนจาก Pipeline เท่านั้น (10_MatchEngine.gs) หรือ Admin/Migration (21_AliasService.gs)
2. **Group Boundary**: Group 2 ห้ามเขียน Master Data โดยตรง — ต้องผ่าน Search Service เท่านั้น
3. **Search Key = ShipToName**: ใน Group 2 ชื่อปลายทาง (ShipToName) คือ search key หลัก ไม่ใช่ Person Name
4. **SCG API Fetch Code**: ห้ามแก้ไขโค้ดส่วนที่เรียก SCG API โดยไม่จำเป็น เพราะมีข้อจำกัดด้าน Cookie และ Rate Limit
5. **Schema-Config-Setup Triangle**: ทุกการเปลี่ยนแปลง Schema ต้องอัปเดต 01_Config + 02_Schema + 03_SetupSheets พร้อมกัน
6. **ข้อมูลใหม่ทันที**: ระบบรองรับการรันกับข้อมูลใหม่ได้ทันที ไม่บังคับ Backfill ข้อมูลเก่า
7. **Header Order**: ต้องรักษาลำดับ Header ให้ตรง Schema เสมอ — การเปลี่ยนลำดับคอลัมน์ทำให้ข้อมูลผิดตำแหน่ง

---

## 24. FIRST_AUDIT_REVIEW15 — Code Quality Audit Cycle (2026-06-12)

### 24.1 Audit Overview
ตรวจสอบโค้ดทั้ง 22 ไฟล์ตามกฎเหล็ก 16 ข้อ → พบ SHOULD_FIX 5 ข้อ → แก้ไขทั้งหมด → Compliance 8/16 → 13/16 PASS

### 24.2 Key Changes
| กฎ | การเปลี่ยนแปลง | ไฟล์ที่กระทบ |
|-----|-------------|-----------|
| ข้อ 7: No Phantom Calls | `invalidateGlobalAliasCache_()` → `CacheService.removeAll()` | 19_Hardening.gs |
| ข้อ 3: No Hardcode Index | 9 จุด `r[1]`~`r[5]` → `*_IDX` constants | 19_Hardening.gs, 10_MatchEngine.gs |
| ข้อ 1: Clean Code | Dead code ลบ, ตัวแปรเปลี่ยนชื่อ, @public tags | 07, 14, 05, 09, 16, 21 |
| ข้อ 13: Logging | 8 จุด logError + `new Error()` stack trace | 08, 14, 11, 04, 10 |
| ข้อ 2: SRP | 18 helper functions แยกออก | 10, 08, 17, 19, 05, 12, 11 |
| ข้อ 5: Checkpoint | Time Guard + Checkpoint เพิ่ม 2 ฟังก์ชัน | 16, 20 |

### 24.3 Critical Bug Found & Fixed
`newRows.push(r)` → `newRows.push(aliasRow)` ใน 19_Hardening.gs — `r` ไม่มีใน scope หลังเปลี่ยนชื่อ parameter

### 24.4 New Helper Functions (18)
| Function | File | Purpose |
|----------|------|---------|
| matchEnrichPersonAliases_() | 10_MatchEngine.gs | Person alias enrichment |
| matchEnrichPlaceAliases_() | 10_MatchEngine.gs | Place alias enrichment |
| matchCommitGlobalAlias_() | 10_MatchEngine.gs | Commit global alias |
| matchCommitPersonAlias_() | 10_MatchEngine.gs | Commit person alias |
| matchCommitPlaceAlias_() | 10_MatchEngine.gs | Commit place alias |
| matchBuildDedupSets_() | 10_MatchEngine.gs | Build dedup sets |
| matchCalcFullScore_() | 10_MatchEngine.gs | Full score calculation |
| matchCalcGeoAnchorScore_() | 10_MatchEngine.gs | Geo anchor score |
| geoClassifyDistance_() | 08_GeoService.gs | Distance classification |
| lookupEnrichOneRow_() | 17_SearchService.gs | Single row enrichment |
| hardeningBuildOneAliasRow_() | 19_Hardening.gs | Build one alias row |
| normExtractPhone_() | 05_NormalizeService.gs | Phone extraction |
| normExtractDocNo_() | 05_NormalizeService.gs | Doc number extraction |
| normNormalizeCompany_() | 05_NormalizeService.gs | Company normalization |
| normCleanHonorific_() | 05_NormalizeService.gs | Honorific cleaning |
| reviewProcessOneRow_() | 12_ReviewService.gs | Process one review row |
| factUpdateRow_() | 11_TransactionService.gs | Fact update row |
| factCreateRow_() | 11_TransactionService.gs | Fact create row |

---

## 25. REFACTOR Cycle (Cycle 5) — 21 Issues, 16 Files Changed

### 25.1 Overview
หลังจาก 4 Audit Cycles ก่อนหน้า (Critical, Performance, Security, Review15) ระบบมีปัญหาโครงสร้างซ้ำซ้อน (DRY violations) และฟังก์ชันขนาดใหญ่เกิน SRP จึงดำเนินการ Refactor 21 ประเด็น แก้ไข 16 จาก 22 ไฟล์ ทั้งหมดผ่านการ VERIFY แล้ว

### 25.2 REFACTOR Issues (REF-001 to REF-021)
| REF | หมวด | ปัญหา | แนวทาง | ไฟล์ที่กระทบ | สถานะ |
|-----|-------|--------|---------|-------------|--------|
| REF-001 | Architecture | 12_ReviewService เรียก Group 1 CRUD โดยตรง | resolveAndPersist_ gateway | 10, 12 | ✅ |
| REF-002 | SRP | fetchDataFromSCGJWD ยาวเกิน | แยก 5 ฟังก์ชัน | 18 | ✅ |
| REF-003 | DRY | UUID converters ซ้ำใน 21_AliasService | ย้ายไป 14_Utils | 14, 21 | ✅ |
| REF-004 | SRP | applyReviewDecision ยาวเกิน | Decision Router + 5 helpers | 12 | ✅ |
| REF-005 | SRP | MIGRATION_HybridAliasSystem ยาวเกิน | Step Orchestrator + 5 steps | 21 | ✅ |
| REF-006 | SRP | populateGeoMetadata ยาวเกิน | transform + flush helpers | 20 | ✅ |
| REF-007 | DRY | flush logic ซ้ำใน SearchService | flushLookupResults_ | 17 | ✅ |
| REF-008 | SRP | buildFullQualityReport ยาวเกิน | collect + compute helpers | 13 | ✅ |
| REF-009 | DRY | batchUpdateStats ซ้ำ 3 ที่ | batchUpdateEntityStats_ | 14, 06, 07, 08 | ✅ |
| REF-010 | DRY | saveChunkedCache ซ้ำ 3 ที่ | รวมใน 14_Utils | 14, 06, 07, 08, 09 | ✅ |
| REF-011 | DRY | invalidateCache ซ้ำ 5 ที่ | invalidateChunkedCache_ | 14, 06, 07, 08, 09 | ✅ |
| REF-012 | DRY | buildGlobalAliasDedupSet_ ซ้ำ | ย้ายไป 14_Utils | 14, 19 | ✅ |
| REF-013 | DRY | person/place enrich ซ้ำ | matchEnrichEntityAliases_ | 10 | ✅ |
| REF-014 | DRY | Thai prefix regex ซ้ำ 6 ที่ | stripThaiAdmin/ProvincePrefix_ | 16, 20 | ✅ |
| REF-015 | DRY | Inline dedup blocks ซ้ำ 3 ที่ | findMatchingPerson/Place_ | 21 | ✅ |
| REF-016 | DRY | geocode/reverse ซ้ำ cache logic | cachedGeoLookup_ 3-layer | 15 | ✅ |
| REF-017 | SRP | load/persist ผสมใน MatchEngine | loadSourceBatch_/persistResult_ | 10 | ✅ |
| REF-018 | Dead Code | saveCheckpoint_/loadCheckpoint_ ไม่ใช้ | ลบ + เปลี่ยนชื่อ clear→reset | 10 | ✅ |
| REF-019 | Convention | columnToLetterHelper ไม่มี _ suffix | เพิ่ม _ suffix | 04, 18 | ✅ |
| REF-020 | Deprecated | getDestinationsByPerson/Place ซ้ำ | @deprecated wrappers | 09 | ✅ |
| REF-021 | DRY | Thai prefix DRY (เดียวกับ REF-014) | รวมกับ REF-014 | 16 | ✅ |

### 25.3 Key Architecture Patterns from REFACTOR
| Pattern | คำอธิบาย | ใช้ใน |
|---------|----------|-------|
| resolveAndPersist_ Gateway | จุดเข้าเดียวสำหรับ persistence → Group 2 ไม่เรียก Group 1 CRUD โดยตรง | 10_MatchEngine, 12_ReviewService |
| batchUpdateEntityStats_ | Centralized batch stats update — thin wrappers ในแต่ละ Service | 14_Utils, 06, 07, 08 |
| Centralized Chunked Cache | saveChunkedCache_/loadChunkedCache_/invalidateChunkedCache_ รวมใน 14_Utils | 14_Utils, ทุก Service |
| cachedGeoLookup_ 3-Layer | RAM Cache → Sheet Cache → API + Retry → Save both | 15_GoogleMapsAPI |
| Thai Prefix DRY | stripThaiAdminPrefix_/stripThaiProvincePrefix_ แทน inline regex | 16_GeoDictionaryBuilder |

### 25.4 Production Readiness
**Overall Score: 95% — ✅ GO**
- Architecture Integrity: 100% | Execution Safety: 95% | Data Integrity: 95%
- Security & Secret Mgmt: 90% | Clean Code Compliance: 100%
- Zero BLOCKING issues | 11 Non-Blocking residual risks
