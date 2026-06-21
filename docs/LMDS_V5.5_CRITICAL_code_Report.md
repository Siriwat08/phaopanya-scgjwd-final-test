# LMDS V5.5 — CRITICAL Fix Cycle Report

> เอกสารสรุปการตรวจสอบ วางแผน ดำเนินการ และยืนยันการแก้ไข Issue สำคัญ 8 รายการ
> Version: V5.5.017 (SECURITY-POSTFIX) | Date: 2026-06-21 | Original audit: V5.5.003 (2026-06-11)
> Commands: FIRST_AUDIT_CRITICAL → FIX_CRITICAL_PLAN → APPLY_CRITICAL_FIX → VERIFY_CRITICAL_FIX

---

## สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [CMD: FIRST_AUDIT_CRITICAL — ผลตรวจสอบ](#2-cmd-first_audit_critical--ผลตรวจสอบ)
3. [CMD: FIX_CRITICAL_PLAN — แผนแก้ไข](#3-cmd-fix_critical_plan--แผนแก้ไข)
4. [CMD: APPLY_CRITICAL_FIX — การดำเนินการ](#4-cmd-apply_critical_fix--การดำเนินการ)
5. [CMD: VERIFY_CRITICAL_FIX — ผลยืนยัน](#5-cmd-verify_critical_fix--ผลยืนยัน)
6. [Side Effect Analysis](#6-side-effect-analysis)
7. [Architecture & Regression Check](#7-architecture--regression-check)
8. [สรุปผลและข้อเสนอแนะ](#8-สรุปผลและข้อเสนอแนะ)

---

## 1. ภาพรวม

### วัตถุประสงค์

ดำเนินการตรวจสอบและแก้ไข Issue สำคัญ (CRITICAL) ในระบบ LMDS V5.5 อย่างเป็นระบบ ผ่านกระบวนการ 4 ขั้นตอน:

| ขั้นตอน | คำสั่ง | หน้าที่ |
|---------|--------|---------|
| 1 | `[CMD: FIRST_AUDIT_CRITICAL]` | ตรวจสอบหา Issue สำคัญจากโค้ดจริง |
| 2 | `[CMD: FIX_CRITICAL_PLAN]` | วางแผนแก้ไขเชิงลึกพร้อม Code Template |
| 3 | `[CMD: APPLY_CRITICAL_FIX]` | ดำเนินการแก้ไขตามแผนที่อนุมัติ |
| 4 | `[CMD: VERIFY_CRITICAL_FIX]` | ยืนยันการแก้ไขด้วยหลักฐานจากโค้ดจริง |

### ขอบเขต

- ไฟล์ที่เกี่ยวข้อง: 6 ไฟล์
- Issue ที่พบ: 8 รายการ (CRIT-001 ถึง CRIT-008)
- ระดับความรุนแรง: CRITICAL ทั้งหมด (กระทบความถูกต้องของข้อมูลหรือเสถียรภาพระบบ)

---

## 2. CMD: FIRST_AUDIT_CRITICAL — ผลตรวจสอบ

### วิธีการตรวจสอบ

อ่านไฟล์โค้ดจริงทั้ง 22 ไฟล์ วิเคราะห์ตามกฎ 16 Immutable Laws + 5 Hard Rules จาก `🤖 LMDS Supreme Engineer.md` และตรวจจับปัญหาเชิงโครงสร้างที่กระทบ Data Integrity, System Stability, และ Architecture Compliance

### ผลลัพธ์: 8 Critical Issues

| ID | ไฟล์ | ระดับ | รายละเอียด | Root Cause |
|----|------|-------|-----------|------------|
| CRIT-001 | `11_TransactionService.gs` | CRITICAL | `resolvedLat`/`resolvedLng` เริ่มต้นด้วย `0` แทน `null` → พิกัดถูกต้องถูกเขียนทับด้วย 0 ใน UPDATE path | Falsy-value Bug: `=== 0` ตรวจไม่ได้ว่ามีพิกัดจริงหรือไม่มี |
| CRIT-002 | `12_ReviewService.gs` | CRITICAL | `executeReviewCreateNew_` ไม่เก็บ return value จาก `upsertFactDelivery` → INSERT row ไม่ถูกเขียนลง FACT_DELIVERY | Silent Data Loss: เรียกฟังก์ชันแต่ไม่ใช้ผลลัพธ์ |
| CRIT-003 | `12_ReviewService.gs` | CRITICAL | `MERGE_TO_CANDIDATE` ไม่เรียก `upsertFactDelivery` → ข้อมูลสูญหายเมื่อ User เลือก Merge | Data Loss: Decision path ไม่มี Transaction Write |
| CRIT-004 | `21_AliasService.gs` | CRITICAL | `MIGRATION_HybridAliasSystem()` ใช้ `sourceSheet` ซึ่งไม่มีใน scope → undefined reference | Variable Scope Error: ชื่อผิด/ไม่ได้ประกาศ |
| CRIT-005 | `10_MatchEngine.gs` | CRITICAL | Entity ใหม่จาก `handleCreateNew_` ไม่ถูกเพิ่มเข้า Alias Enrichment Context → stale cache | Stale Cache: สร้าง Entity ใหม่แต่ cache ไม่รู้ |
| CRIT-006 | `12_ReviewService.gs` | CRITICAL | `applyAllPendingDecisions()` ไม่มี LockService → Race Condition เมื่อ 2 ผู้ใช้รันพร้อมกัน | Concurrency Bug: ไม่มี Lock ป้องกันการรันซ้อน |
| CRIT-007 | `19_Hardening.gs` | CRITICAL | `flushGlobalAliasRows_` เขียนตรงลง M_ALIAS sheet แทนเรียก `createGlobalAlias()` → ละเมิด Single Writer Pattern | Architecture Violation: ข้ามจุดเขียนเดียว |
| CRIT-008 | `04_SourceRepository.gs` | CRITICAL | `getProcessedInvoiceSet_` ใช้ `cache.put` ตรง → ข้อมูลเกิน 100KB จะ fail แบบเงียบ | Cache Limit Exceeded: CacheService จำกัด 100KB/key |

---

## 3. CMD: FIX_CRITICAL_PLAN — แผนแก้ไข

### หลักการแก้ไข

1. **ยึดโค้ดจริง**: ทุกแผนอ้างอิงจากไฟล์จริงและ Constants จาก `01_Config.gs`/`02_Schema.gs`
2. **Full File Output**: ห้ามตัดทอนโค้ด (Rule 15)
3. **ใช้ Constants**: ทุกตำแหน่งใช้ `XXX_IDX` / `SHEET.*` / `CACHE_KEY.*` ไม่ใช้ magic number
4. **มี Comment `[FIX CRIT-XXX]`**: ทุกจุดที่แก้ต้องมี comment ระบุ Issue ID

### แผนรายข้อ

#### CRIT-001: Null Initialization for resolvedLat/resolvedLng

| ขั้นตอน | การเปลี่ยนแปลง | ไฟล์:บรรทัด |
|---------|----------------|-------------|
| A | เปลี่ยน `let resolvedLat = 0` → `let resolvedLat = null` | `11_TransactionService.gs:83` |
| B | เปลี่ยน `let resolvedLng = 0` → `let resolvedLng = null` | `11_TransactionService.gs:84` |
| C | เปลี่ยน fallback `if (resolvedLat === 0 \|\| resolvedLng === 0)` → `if (resolvedLat === null \|\| resolvedLng === null)` | `11_TransactionService.gs:96` |
| D | UPDATE path: เปลี่ยน `resolvedLat \|\| rowData[...]` → `resolvedLat !== null ? resolvedLat : rowData[...]` | `11_TransactionService.gs:132-133` |
| E | INSERT path: เปลี่ยน `resolvedLat \|\| 0` → `resolvedLat !== null ? resolvedLat : 0` | `11_TransactionService.gs:175-176` |

**เหตุผล**: `0` เป็นค่าที่ถูกต้อง (Gulf of Guinea อยู่ที่ 0,0) การใช้ `null` แยก "ไม่มีพิกัด" กับ "พิกัดเป็น 0" ได้ชัดเจน ใน UPDATE path ต้องรักษาค่าเดิมถ้าไม่มีพิกัดใหม่ ใน INSERT path ใช้ `0` เพราะ Google Sheets ไม่ควรมี `null` ในคอลัมน์ตัวเลข

#### CRIT-002: Capture upsertFactDelivery Return Value in executeReviewCreateNew_

| ขั้นตอน | การเปลี่ยนแปลง | ไฟล์:บรรทัด |
|---------|----------------|-------------|
| A | เก็บ return value: `const factResult = upsertFactDelivery(...)` | `12_ReviewService.gs:590` |
| B | เขียน INSERT row ทันที: `if (factResult && factResult.isNew && factResult.rowData) { factSheet.getRange(...).setValues(...) }` | `12_ReviewService.gs:594-598` |
| C | ล้าง RAM cache: `invalidateFactInvoiceCache_()` | `12_ReviewService.gs:600` |

**เหตุผล**: `upsertFactDelivery` ออกแบบให้ INSERT path คืน `{ isNew: true, rowData: [...] }` ให้ caller เขียนแบบ batch ถ้าไม่เก็บ return value ข้อมูลจะสูญหายเงียบๆ

#### CRIT-003: MERGE_TO_CANDIDATE Calls upsertFactDelivery

| ขั้นตอน | การเปลี่ยนแปลง | ไฟล์:บรรทัด |
|---------|----------------|-------------|
| A | สร้าง `srcObj` จาก review row data (invoiceNo, sourceRow, rawPersonName, rawAddress, rawLat, rawLng, deliveryDate, deliveryTime) | `12_ReviewService.gs:390-401` |
| B | Resolve Geo และ Destination สำหรับ merge target | `12_ReviewService.gs:404-415` |
| C | เรียก `upsertFactDelivery(srcObj, targetPersonId, targetPlaceId, targetGeoId, targetDestId, decision)` | `12_ReviewService.gs:418-419` |
| D | เขียน INSERT row ทันที + ล้าง cache | `12_ReviewService.gs:422-429` |

**เหตุผล**: MERGE_TO_CANDIDATE เป็นการยืนยันจาก User ว่าข้อมูลนี้ถูกต้องและควรบันทึกลง FACT_DELIVERY ถ้าไม่เรียก upsertFactDelivery ข้อมูลจะสูญหาย

#### CRIT-004: Replace Undefined sourceSheet with sourceSheetForCheck

| ขั้นตอน | การเปลี่ยนแปลง | ไฟล์:บรรทัด |
|---------|----------------|-------------|
| A | เพิ่ม local variable: `const sourceSheetForCheck = ss.getSheetByName(SHEET.SOURCE)` | `21_AliasService.gs:674` |
| B | เปลี่ยน `!sourceSheet \|\| sourceSheet.getLastRow()` → `!sourceSheetForCheck \|\| sourceSheetForCheck.getLastRow()` | `21_AliasService.gs:675` |

**เหตุผล**: `sourceSheet` เป็นชื่อที่ไม่ได้ประกาศใน scope ของ `MIGRATION_HybridAliasSystem()` ทำให้เป็น `undefined` เสมอ การตรวจสอบจึงผ่านเสมอ แม้ชีต SOURCE จะว่าง

#### CRIT-005: Add Entity to Alias Enrichment Context

| ขั้นตอน | การเปลี่ยนแปลง | ไฟล์:บรรทัด |
|---------|----------------|-------------|
| A | เพิ่ม module-level variable: `let _ALIAS_ENRICHMENT_CONTEXT = null` | `10_MatchEngine.gs:93` |
| B | เพิ่ม function `addEntityToEnrichmentContext_(entityType, entityId, masterUuid, canonical, normalized)` | `10_MatchEngine.gs:105-120` |
| C | เรียกหลัง createPerson ใน `handleCreateNew_`: `addEntityToEnrichmentContext_('PERSON', personId, pUuid, ...)` | `10_MatchEngine.gs:933-937` |
| D | เรียกหลัง createPlace ใน `handleCreateNew_`: `addEntityToEnrichmentContext_('PLACE', placeId, plUuid, ...)` | `10_MatchEngine.gs:949-953` |
| E | Cleanup ใน `runMatchEngine` finally block: `_ALIAS_ENRICHMENT_CONTEXT = null` | `10_MatchEngine.gs:243` |

**เหตุผล**: เมื่อ `handleCreateNew_` สร้าง Person/Place ใหม่ entity เหล่านั้นจะไม่อยู่ใน `_ALIAS_ENRICHMENT_CONTEXT` ที่โหลดไว้ตอนต้น ทำให้ `autoEnrichAliasesFromFactBatch_` ไม่สร้าง alias ให้ entity ใหม่ใน batch flush รอบเดียวกัน

#### CRIT-006: Add LockService to applyAllPendingDecisions

| ขั้นตอน | การเปลี่ยนแปลง | ไฟล์:บรรทัด |
|---------|----------------|-------------|
| A | เพิ่ม `const lock = LockService.getScriptLock()` ตอนต้นฟังก์ชัน | `12_ReviewService.gs:157` |
| B | เพิ่ม `lock.tryLock(APP_CONST.LOCK_TIMEOUT_MS)` พร้อม error handling | `12_ReviewService.gs:159-163` |
| C | เพิ่ม `if (!lock.hasLock()) { safeUiAlert_(...); return; }` | `12_ReviewService.gs:164-167` |
| D | เพิ่ม `finally { lock.releaseLock(); }` ตอนท้าย | `12_ReviewService.gs:252-255` |

**เหตุผล**: `applyAllPendingDecisions` เป็น entry point จากเมนู ถ้า 2 ผู้ใช้กดประมวลผลพร้อมกัน อาจเกิด double-processing, data corruption, หรือ conflict ได้ ต้องมี Lock ป้องกัน

#### CRIT-007: Use createGlobalAlias Instead of Direct Write

| ขั้นตอน | การเปลี่ยนแปลง | ไฟล์:บรรทัด |
|---------|----------------|-------------|
| A | เปลี่ยน `flushGlobalAliasRows_` จาก `mAliasSheet.getRange().setValues()` → `rows.forEach(function(r) { createGlobalAlias(masterUuid, variantName, entityType, confidence, source) })` | `19_Hardening.gs:406-418` |

**เหตุผล**: Single Writer Pattern กำหนดให้ `createGlobalAlias()` เป็นช่องทางเดียวสำหรับเขียน M_ALIAS ในบริบท Admin/Migration การเขียนตรงข้ามช่องทางนี้ ทำให้ข้อมูลอาจไม่ผ่าน dedup check, cache invalidation, หรือ validation ที่ `createGlobalAlias` ทำ

#### CRIT-008: Chunked Cache for getProcessedInvoiceSet_

| ขั้นตอน | การเปลี่ยนแปลง | ไฟล์:บรรทัด |
|---------|----------------|-------------|
| A | เพิ่ม function `saveProcessedInvoicesToCache_(cache, doneSet)` พร้อม chunked pattern (CHUNK_SIZE=200) | `04_SourceRepository.gs:238-280` |
| B | เพิ่ม function `loadProcessedInvoicesFromCache_(cache)` พร้อม chunk reassembly | `04_SourceRepository.gs:287-318` |
| C | เปลี่ยน `getProcessedInvoiceSet_` ให้ใช้ chunked loader | `04_SourceRepository.gs:208` |
| D | อัปเดต `invalidateSourceCache` ให้ล้าง chunked invoice cache ด้วย | `04_SourceRepository.gs:439-444` |

**เหตุผล**: CacheService จำกัด 100KB ต่อ key เมื่อ Invoice เกิน ~2,000 รายการ JSON จะเกิน limit และ `cache.put` จะ fail แบบเงียบ ทำให้ cache ไม่ทำงานและอ่านชีตทุกครั้งแทน

---

## 4. CMD: APPLY_CRITICAL_FIX — การดำเนินการ

### สรุปการดำเนินการ

| ID | ไฟล์ | จุดที่แก้ (จำนวน) | สถานะ |
|----|------|-------------------|--------|
| CRIT-001 | `11_TransactionService.gs` | 5 จุด | ✅ Applied |
| CRIT-002 | `12_ReviewService.gs` | 3 จุด | ✅ Applied |
| CRIT-003 | `12_ReviewService.gs` | 4 จุด | ✅ Applied |
| CRIT-004 | `21_AliasService.gs` | 2 จุด | ✅ Applied |
| CRIT-005 | `10_MatchEngine.gs` | 5 จุด | ✅ Applied |
| CRIT-006 | `12_ReviewService.gs` | 4 จุด | ✅ Applied |
| CRIT-007 | `19_Hardening.gs` | 1 จุด | ✅ Applied |
| CRIT-008 | `04_SourceRepository.gs` | 4 จุด | ✅ Applied |

### ข้อกำหนดการแก้ไข

- **Full File Output**: ทุกไฟล์แก้แบบเต็ม ไม่มีการตัดทอน
- **Constants Only**: ใช้ `FACT_IDX.*`, `REVIEW_IDX.*`, `SHEET.*`, `CACHE_KEY.*`, `APP_CONST.*` เท่านั้น ไม่มี magic number
- **Comment Format**: ทุกจุดที่แก้มี comment `[FIX CRIT-XXX]` ระบุ Issue ID

---

## 5. CMD: VERIFY_CRITICAL_FIX — ผลยืนยัน

### วิธีการยืนยัน

อ่านไฟล์โค้ดจริงทั้ง 6 ไฟล์ ตรวจสอบทีละ Issue โดยยึดหลักฐานจาก:
1. **Direct Fix Validation**: ตรวจว่าโค้ดที่แก้มีอยู่จริงในไฟล์ พร้อมเลขบรรทัด
2. **Side Effect Analysis**: ตรวจว่าการแก้ไม่กระทบ callers อื่น
3. **Architecture & Regression Check**: ตรวจว่า Single Writer Pattern, Time Guard, No Phantom Calls ยังคงอยู่

### ผลลัพธ์รายข้อ

#### CRIT-001: ✅ FIX_CONFIRMED

| จุดตรวจ | ไฟล์:บรรทัด | หลักฐานจากโค้ดจริง |
|---------|-------------|---------------------|
| init `0`→`null` | `11_TransactionService.gs:83-84` | `let resolvedLat = null;` / `let resolvedLng = null;` + comment `[FIX CRIT-001]` |
| fallback `===0`→`===null` | `11_TransactionService.gs:96` | `if (resolvedLat === null \|\| resolvedLng === null)` + comment `[FIX CRIT-001]` |
| UPDATE strict `!==null` | `11_TransactionService.gs:132-133` | `resolvedLat !== null ? resolvedLat : rowData[FACT_IDX.RESOLVED_LAT]` + comment `[FIX CRIT-001]` |
| INSERT `null→0` | `11_TransactionService.gs:175-176` | `resolvedLat !== null ? resolvedLat : 0` + comment `[FIX CRIT-001]` |

**Side Effect**: ไม่มี — `upsertFactDelivery` เป็น pure function ที่ caller เรียกเหมือนเดิม ไม่เปลี่ยน return format

#### CRIT-002: ✅ FIX_CONFIRMED

| จุดตรวจ | ไฟล์:บรรทัด | หลักฐานจากโค้ดจริง |
|---------|-------------|---------------------|
| capture return | `12_ReviewService.gs:590` | `const factResult = upsertFactDelivery(srcObj, personId, placeId, geoId, destId, {...})` + comment `[FIX CRIT-002]` |
| INSERT write | `12_ReviewService.gs:594-598` | `if (factResult && factResult.isNew && factResult.rowData) { factSheet.getRange(...).setValues([factResult.rowData]) }` + comment `[FIX CRIT-002]` |
| cache invalidate | `12_ReviewService.gs:600` | `if (typeof invalidateFactInvoiceCache_ === 'function') invalidateFactInvoiceCache_();` |

**Side Effect**: ไม่มี — `executeReviewCreateNew_` เป็น private function เรียกจาก `applyReviewDecision` เท่านั้น

#### CRIT-003: ✅ FIX_CONFIRMED

| จุดตรวจ | ไฟล์:บรรทัด | หลักฐานจากโค้ดจริง |
|---------|-------------|---------------------|
| create srcObj | `12_ReviewService.gs:376-401` | สร้าง `srcObj` จาก review row data พร้อม `deliveryDate`, `deliveryTime` จาก SOURCE sheet + comment `[FIX CRIT-003]` |
| resolve geo | `12_ReviewService.gs:404-407` | `if (srcObj.hasGeo) { const geoResult = resolveGeo(rawLat, rawLng); targetGeoId = ... }` |
| resolve dest | `12_ReviewService.gs:410-415` | `if (targetPersonId \|\| targetPlaceId) { const destResult = resolveDestination(...) }` |
| call upsert | `12_ReviewService.gs:418-419` | `const factResult = upsertFactDelivery(srcObj, targetPersonId, targetPlaceId, targetGeoId, targetDestId, {...})` + comment `[FIX CRIT-003]` |
| INSERT write | `12_ReviewService.gs:422-429` | `if (factResult && factResult.isNew && factResult.rowData) { factSheet.getRange(...).setValues(...) }` + comment `[FIX CRIT-003]` |

**Side Effect**: การเพิ่ม `resolveGeo()` และ `resolveDestination()` ใน MERGE_TO_CANDIDATE path อาจเพิ่ม API calls แต่จำเป็นต้องมีเพื่อความถูกต้องของข้อมูล

#### CRIT-004: ✅ FIX_CONFIRMED

| จุดตรวจ | ไฟล์:บรรทัด | หลักฐานจากโค้ดจริง |
|---------|-------------|---------------------|
| local var | `21_AliasService.gs:674` | `const sourceSheetForCheck = ss.getSheetByName(SHEET.SOURCE);` + comment `[FIX CRIT-004]` |
| condition | `21_AliasService.gs:675` | `if (scgCount > 0 \|\| !sourceSheetForCheck \|\| sourceSheetForCheck.getLastRow() < 2)` |

**Side Effect**: ไม่มี — เป็นการเพิ่ม local variable ที่ถูกต้อง ไม่กระทบตัวแปรอื่น

#### CRIT-005: ✅ FIX_CONFIRMED

| จุดตรวจ | ไฟล์:บรรทัด | หลักฐานจากโค้ดจริง |
|---------|-------------|---------------------|
| module cache | `10_MatchEngine.gs:93` | `let _ALIAS_ENRICHMENT_CONTEXT = null;` + comment `[FIX CRIT-018]` |
| function defined | `10_MatchEngine.gs:105-120` | `function addEntityToEnrichmentContext_(entityType, entityId, masterUuid, canonical, normalized)` + comment `[FIX CRIT-005]` |
| call after createPerson | `10_MatchEngine.gs:933-937` | `if (personId) { var pUuid = convertPersonIdToUuid(personId); addEntityToEnrichmentContext_('PERSON', personId, pUuid, ...) }` + comment `[FIX CRIT-005]` |
| call after createPlace | `10_MatchEngine.gs:949-953` | `if (placeId) { var plUuid = convertPlaceIdToUuid(placeId); addEntityToEnrichmentContext_('PLACE', placeId, plUuid, ...) }` + comment `[FIX CRIT-005]` |
| cleanup | `10_MatchEngine.gs:243` | `_ALIAS_ENRICHMENT_CONTEXT = null;` ใน `finally` block |

**Side Effect**: `addEntityToEnrichmentContext_` มี guard `if (!_ALIAS_ENRICHMENT_CONTEXT) return;` ป้องกัน null reference ไม่กระทบ caller อื่น

#### CRIT-006: ✅ FIX_CONFIRMED

| จุดตรวจ | ไฟล์:บรรทัด | หลักฐานจากโค้ดจริง |
|---------|-------------|---------------------|
| getScriptLock | `12_ReviewService.gs:157` | `const lock = LockService.getScriptLock();` + comment `[FIX CRIT-006]` |
| tryLock | `12_ReviewService.gs:159` | `lock.tryLock(APP_CONST.LOCK_TIMEOUT_MS);` |
| hasLock check | `12_ReviewService.gs:164-167` | `if (!lock.hasLock()) { safeUiAlert_(...); return; }` |
| releaseLock | `12_ReviewService.gs:254` | `lock.releaseLock();` ใน `finally` block + comment `[FIX CRIT-006]` |

**Side Effect**: ถ้า Lock ไม่ได้ ผู้ใช้จะเห็น Alert แจ้งว่ามีการรันซ้อน แทนที่จะรันซ้อนจริง (ซึ่งเป็นพฤติกรรมที่ถูกต้อง)

#### CRIT-007: ✅ FIX_CONFIRMED

| จุดตรวจ | ไฟล์:บรรทัด | หลักฐานจากโค้ดจริง |
|---------|-------------|---------------------|
| createGlobalAlias per row | `19_Hardening.gs:409-417` | `rows.forEach(function(r) { var result = createGlobalAlias(masterUuid, variantName, entityType, confidence, source); if (result) count++; })` + comment `[FIX CRIT-007]` |
| no direct write | same function | ไม่มี `mAliasSheet.getRange().setValues()` ใน `flushGlobalAliasRows_` |

**Side Effect**: ประสิทธิภาพลดลงเล็กน้อยเพราะ `createGlobalAlias()` เรียก `loadGlobalAliasesMap_()` ทุกครั้ง แต่ `loadGlobalAliasesMap_()` ใช้ chunked cache จึงไม่อ่านชีตทุกครั้ง และ `generatePersonAliasesFromHistory` มี Time Guard อยู่แล้ว

#### CRIT-008: ✅ FIX_CONFIRMED

| จุดตรวจ | ไฟล์:บรรทัด | หลักฐานจากโค้ดจริง |
|---------|-------------|---------------------|
| save function | `04_SourceRepository.gs:238-280` | `function saveProcessedInvoicesToCache_(cache, doneSet)` พร้อม chunked pattern + comment `[FIX CRIT-008]` |
| load function | `04_SourceRepository.gs:287-318` | `function loadProcessedInvoicesFromCache_(cache)` พร้อม chunk reassembly + comment `[FIX CRIT-008]` |
| used in getter | `04_SourceRepository.gs:208` | `const cached = loadProcessedInvoicesFromCache_(cache);` + comment `[FIX CRIT-008]` |
| invalidate clears chunks | `04_SourceRepository.gs:439-444` | clears `CACHE_KEY_INVOICES + '_CHUNKS'` + each chunk key + comment `[FIX CRIT-008]` |

**Side Effect**: ไม่มี — chunked cache เป็น transparent layer ที่ caller ไม่ต้องรู้ ยกเว้น `invalidateSourceCache` ต้องล้าง chunk keys เพิ่ม

---

## 6. Side Effect Analysis

### สรุปผลกระทบข้ามโมดูล

| Fix | Cross-Group Impact | ต้องแก้ Caller ไหม |
|-----|-------------------|-------------------|
| CRIT-001 | ไม่มี — `upsertFactDelivery` return format เดิม | ไม่ต้อง |
| CRIT-002 | ไม่มี — `executeReviewCreateNew_` private | ไม่ต้อง |
| CRIT-003 | เพิ่ม API calls ใน MERGE path (จำเป็น) | ไม่ต้อง |
| CRIT-004 | ไม่มี — local variable เท่านั้น | ไม่ต้อง |
| CRIT-005 | ไม่มี — function ใหม่ + private cache | ไม่ต้อง |
| CRIT-006 | เปลี่ยนพฤติกรรม: concurrent run จะถูกปฏิเสธ | ไม่ต้อง (by design) |
| CRIT-007 | ประสิทธิภาพลดเล็กน้อย แต่ปลอดภัยกว่า | ไม่ต้อง |
| CRIT-008 | ไม่มี — transparent cache layer | ไม่ต้อง |

---

## 7. Architecture & Regression Check

### Single Writer Pattern ✅

| ตำแหน่งเขียน | ช่องทาง | สถานะ |
|-------------|---------|--------|
| Pipeline auto | `autoEnrichAliasesFromFactBatch_()` ใน `10_MatchEngine.gs` | ✅ ยังเป็นจุดเขียนเดียว |
| Admin/Migration | `createGlobalAlias()` ใน `21_AliasService.gs` | ✅ CRIT-007 แก้ให้ใช้ช่องทางนี้ |
| Hardening | `flushGlobalAliasRows_()` → `createGlobalAlias()` | ✅ แก้แล้ว (CRIT-007) |

### Time Guard ✅

| ฟังก์ชัน | Time Guard | สถานะ |
|----------|-----------|--------|
| `runMatchEngine()` | ✅ มี (AI_CONFIG.TIME_LIMIT_MS) | ไม่เปลี่ยน |
| `applyAllPendingDecisions()` | ✅ มี (ทุก 20 แถว) | ไม่เปลี่ยน |
| `MIGRATION_HybridAliasSystem()` | ✅ มี | ไม่เปลี่ยน |
| `generatePersonAliasesFromHistory()` | ✅ มี | ไม่เปลี่ยน |

### No Phantom Calls ✅

ตรวจสอบว่าไม่มีการเรียกฟังก์ชันที่ไม่มีอยู่จริง:

| ฟังก์ชันที่เรียก | มีอยู่จริง | ไฟล์ |
|-----------------|-----------|------|
| `invalidateFactInvoiceCache_()` | ✅ | `11_TransactionService.gs:258` |
| `addEntityToEnrichmentContext_()` | ✅ | `10_MatchEngine.gs:105` |
| `convertPersonIdToUuid()` | ✅ | `21_AliasService.gs:503` |
| `convertPlaceIdToUuid()` | ✅ | `21_AliasService.gs:513` |
| `createGlobalAlias()` | ✅ | `21_AliasService.gs:198` |
| `resolveDestination()` | ✅ | `09_DestinationService.gs` |
| `resolveGeo()` | ✅ | `08_GeoService.gs` |

---

## 8. สรุปผลและข้อเสนอแนะ

### สรุปผลรวม

| ตัวชี้วัด | ค่า |
|----------|-----|
| **Issue ที่พบ** | 8 CRITICAL |
| **Issue ที่แก้แล้ว** | 8 (100%) |
| **Verify ผ่าน** | 8/8 (100%) |
| **Side Effect รุนแรง** | 0 |
| **Architecture Violation คงเหลือ** | 0 |
| **Phantom Calls** | 0 |
| **ไฟล์ที่เปลี่ยนแปลง** | 6 จาก 22 |

### Verdict Matrix

| ID | Verdict | หมายเหตุ |
|----|---------|---------|
| CRIT-001 | ✅ FIX_CONFIRMED | Null handling สำหรับพิกัดถูกต้อง |
| CRIT-002 | ✅ FIX_CONFIRMED | INSERT row เขียนทันที ไม่สูญหาย |
| CRIT-003 | ✅ FIX_CONFIRMED | MERGE_TO_CANDIDATE บันทึก FACT_DELIVERY |
| CRIT-004 | ✅ FIX_CONFIRMED | ใช้ local variable ที่ถูกต้อง |
| CRIT-005 | ✅ FIX_CONFIRMED | Entity ใหม่เข้า cache ทันที |
| CRIT-006 | ✅ FIX_CONFIRMED | LockService ป้องกัน Race Condition |
| CRIT-007 | ✅ FIX_CONFIRMED | สอดคล้อง Single Writer Pattern |
| CRIT-008 | ✅ FIX_CONFIRMED | Chunked cache รองรับข้อมูลใหญ่ |

### ข้อเสนอแนะ

1. **ดำเนินการต่อได้** → `[CMD: FIRST_AUDIT_PERFORMANCE]` เพื่อตรวจสอบประสิทธิภาพ
2. **อัปเดตเอกสาร** → README.md และ BLUEPRINT.md ต้องเพิ่ม CRIT-001 ถึง CRIT-008 ใน Bug Status
3. **Regression Test** → แนะนำให้ทดสอบกรณี:
   - MERGE_TO_CANDIDATE แล้วตรวจว่า FACT_DELIVERY มีแถวใหม่
   - กดประมวลผล Review 2 คนพร้อมกัน แล้วตรวจว่ามี Lock
   - รัน Migration แล้วตรวจว่า Step 4 checkpoint ทำงานถูกต้อง

---

## Security Fix Cycle (V5.5.004 — historical; current release V5.5.015 — 2026-06-19)

หลังจากแก้ไข Critical Issues ทั้ง 8 รายการแล้ว ได้ดำเนินการตรวจสอบช่องโหว่ด้านความปลอดภัยและแก้ไขเพิ่มเติมอีก 7 รายการ (ปัจจุบัน V5.5.016 เป็นเวอร์ชันที่ปล่อยแล้ว — APP_VERSION = '5.5.016'):

| SEC ID | ช่องโหว่ | Severity | Verdict |
|--------|----------|----------|---------|
| SEC-001 | Cookie ใน Spreadsheet Cell | 🔴 HIGH | ✅ FIX_CONFIRMED |
| SEC-002 | ไม่มี Authorization Guard | 🔴 HIGH | ✅ FIX_CONFIRMED |
| SEC-003 | ไม่มี Cookie Sanitization | 🟡 MEDIUM | ✅ FIX_CONFIRMED |
| SEC-004 | PII ใน Log Output | 🟡 MEDIUM | ✅ FIX_CONFIRMED |
| SEC-005 | ไม่มี Protected Ranges | 🔴 HIGH | ✅ FIX_CONFIRMED |
| SEC-006 | API Key ใน URL | 🟡 MEDIUM | ✅ FIX_CONFIRMED |
| SEC-007 | Reviewer Email ไม่ Mask | 🟡 MEDIUM | ✅ FIX_CONFIRMED |

**ผลรวม: 7/7 ✅ FIX_CONFIRMED — ไม่พบ Regression**

ดูรายละเอียดเพิ่มเติมได้ที่: `LMDS_V5.5_Security_Audit_Verification_Report.md`

---

## 9. FIRST_AUDIT_REVIEW15 — ผลการตรวจสอบคุณภาพโค้ด (2026-06-12)

ระบบ LMDS V5.5 ผ่านการตรวจสอบคุณภาพโค้ดตามกฎเหล็ก 16 ข้อ (Audit Cycle: FIRST_AUDIT_REVIEW15 → FIX_REVIEW15_PLAN → APPLY_REVIEW15_FIX → VERIFY_REVIEW15_FIX)

**ผลลัพธ์:** Compliance 8/16 → 13/16 → 16/16 PASS (+3 from REFACTOR) | 14 ไฟล์แก้ไข | 18 Helper Functions ใหม่ | 1 Critical Bug Hot-Fixed

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
