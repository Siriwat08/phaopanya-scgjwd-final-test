# Changelog — LMDS V5.5

All notable changes to LMDS V5.5 (Logistics Master Data System) are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## Versions Summary

| Version | Date | Cycle | Issues |
|---------|------|-------|--------|
| 5.5.020 | 2026-06-22 | REFACTOR_CYCLE6_RESIDUAL | REF-005 cleanup + REF-011 pilot |
| 5.5.019 | 2026-06-22 | REFACTOR_CYCLE6 | 12 (REF-001 to REF-012) |
| 5.5.018 | 2026-06-21 | REVIEW15 CLEAN CODE FIX | 14 |
| 5.5.017 | 2026-06-21 | SECURITY POSTFIX | 12 SEC |
| 5.5.016 | 2026-06-21 | PERFORMANCE FIX | 13 |
| 5.5.015 | 2026-06-21 | CRITICAL FIX | 2 |
| 5.5.014 | 2026-06-20 | DRIVER VERIFIED + ALIAS ENRICHMENT | 2 features |
| 5.5.013 | 2026-06-20 | GOOGLE MAPS REFACTOR | 2 |
| 5.5.012 | 2026-06-19 | ANTIPATTERN FIX + DOC SYNC | 5 + doc |
| 5.5.011 | 2026-06-19 | DATA CONSISTENCY + SHIPTONAME CLEAN + Q_REVIEW NAV | 3 features |
| 5.5.010 | 2026-06-18 | CACHE HOTFIX + Q_REVIEW POST-PROCESSOR | 3 root cause + integration |
| 5.5.009 | 2026-06-18 | DOC SYNC | DEPENDENCIES/ARCHITECTURE + .md docs |
| 5.5.008 | 2026-06-18 | CACHE CLEANUP P2 | 6 |
| 5.5.007 | 2026-06-18 | CACHE FIX P0+P1 | 9 |
| 5.5.006 | 2026-06-18 | CONSISTENCY SYNC | 28 doc inconsistencies |
| 5.5.005 | 2026-06-16 | REVIEW SERVICE FIX | (intermediate) |
| 5.5.004 | 2026-06-15 | INITIAL AUDIT CYCLES | 53 audit issues |

---

## [5.5.020] — 2026-06-22 — REFACTOR_CYCLE6_RESIDUAL (REF-005 cleanup + REF-011 pilot)

### REF-005 Residual Cleanup (FIX_CONFIRMED)
- ลบ stale CHANGELOG entries 1,326 บรรทัดใน 20 ไฟล์ (entries เก่า v5.5.012-016 ที่ค้างอยู่)
- หลัง V5.5.019 REF-005 PARTIAL_FIX — script trim ตัด entries หลัง SECURITY POSTFIX แต่ไม่ได้ตัด entries ก่อนหน้า
- V5.5.020 แก้ด้วย Python script ที่ตรวจหา purpose_divider และ compact_divider แล้วตัดทุกอย่างระหว่างนั้น
- ผล: 0 stale entries คงเหลือ, total lines ลดจาก 17,344 → 16,018 (-1,326 บรรทัด)
- 22/22 ไฟล์ผ่าน syntax check

### REF-011 Pilot Implementation (FIX_CONFIRMED)
- Apply `withEntryPointGuard_` ใน 3 entry points:
  1. `populateGeoMetadata()` (20_ThGeoService.gs) — error handling + flushLogBuffer_ via guard
  2. `buildGeoDictionary()` (16_GeoDictionaryBuilder.gs) — error handling + flushLogBuffer_ via guard
  3. `fetchDataFromSCGJWD()` (18_ServiceSCG.gs) — error handling + lock release + flushLogBuffer_ via guard
- Preserve Behavior 100%:
  - errorPrefix='เกิดข้อผิดพลาด: ' (same as original alert message)
  - lock release handled by guard via `options.lock`
  - flushLogBuffer_ handled by guard in finally
- ลด boilerplate ~30 บรรทัด across 3 entry points

### Bump Version + Documentation Sync
- APP_VERSION: 5.5.019 → 5.5.020
- SCHEMA_VERSION: 5.5.019 → 5.5.020
- 21/22 .gs files: bump VERSION header + update Latest 3 versions block
- showVersionInfo(): แสดง v5.5.020 + Audit Cycles 14 → 17
- CHANGELOG.md: เพิ่ม V5.5.020 entry

### Cumulative Impact
- Total lines: 17,344 → 16,018 (-1,326, -7.6%)
- Functions >100 lines: 4 (unchanged from V5.5.019)
- Module Boundary violations: 0 (maintained)
- Production Readiness: 97% GO (preserved from V5.5.020)

---

## [5.5.019] — 2026-06-22 — REFACTOR_CYCLE6 (12 issues)

### High Priority (5)
- [REF-001] Module Boundary: Group 2 (12_ReviewService) เรียก Group 1 CRUD ผ่าน public helpers
  - Added: reprocResolveOrCreatePersonForReview_, reprocResolveOrCreatePlaceForReview_, reprocCreateDestinationForReview_ (10_MatchEngine)
  - Added: reprocCreateDestinationViaGateway_ (12_ReviewService wrapper)
  - Result: 0 direct createPerson/createPlace/createDestination calls in Group 2
- [REF-002] Code Duplication: pattern ซ้ำ 30 บรรทัดใน Group A/B/C
  - Added: reprocApplyFactUpdate_, reprocApplyReviewUpdate_ shared mutators
  - ลด Group A/B/C รวมจาก 166 → ~92 บรรทัด (-45%)
- [REF-003] Alias Enrichment Checkpoint: populateAliasFromSCGRawData_ + populateAliasFromFactDelivery_
  - Added: saveAliasEnrichCheckpoint_, loadAliasEnrichCheckpoint_, clearAliasEnrichCheckpoint_
  - 24h stale protection (mirror Hardening pattern)
  - installAutoResume_ + removeAutoResume_ integration
- [REF-004] runMatchEngine Split: 132 → 35 บรรทัด orchestrator + 4 section helpers
  - acquireMatchEngineLock_, prepareMatchEngineContext_, runMatchEngineLoop_, finalizeMatchEngine_
- [REF-005] CHANGELOG Centralization: 22 .gs files × ~50-100 lines → 15 lines each + centralized docs/CHANGELOG.md
  - ลด ~1,430 บรรทัดซ้ำซ้อนทั่วโปรเจกต์

### Medium Priority (5) — Phase B
- [REF-006] generatePersonAliasesFromHistory Split: 134 → 25 บรรทัด + 4 section helpers
- [REF-007] findPersonCandidates Strategy Extraction: 5 strategies → 5 helper functions
- [REF-008] reprocPrepareContext_ Split: 118 → 15 บรรทัด orchestrator + 4 setup helpers
- [REF-009] MIGRATION_HybridAliasSystem Loop: 117 → 50 บรรทัด + MIGRATION_STEPS array
- [REF-010] applySheetProtection_UI Split: 114 → 30 บรรทัด + schema-safe range (REVIEW_IDX.*)

### Low Priority (2) — Phase C
- [REF-011] withEntryPointGuard_ higher-order function (3 pilot entry points)
- [REF-012] Deprecate getColIndex with @deprecated JSDoc + warning log

### Cumulative Impact
- Total lines reduced: ~1,655 (-9.5%)
- Functions >100 lines: 16 → 4 (-12)
- Module Boundary violations: 5 → 0
- Batch processors w/o checkpoint: 2 → 0
- New helpers added: ~32

---

## [5.5.018] — 2026-06-21 — REVIEW15 CLEAN CODE FIX (14 issues, Cycle 15)

- [R13-01] logError with Error object in 14 catch blocks (9 P0 Rule 13)
- [R1-01] var → const in 12 declarations (3 P1 Rule 1)
- [R2-01] Split reprocessReviewQueue 432 → 40 lines + 6 helpers (1 P1 Rule 2)
  - Helpers: reprocPrepareContext_, reprocProcessAllRows_, reprocGroupA_YellowWithName_, reprocGroupB_NewRecordWithGeo_, reprocGroupC_FuzzyHighScore_, reprocBatchWriteAndReport_
- [R7-01] Remove 3 phantom function references (3 P2 Rule 7)
- Cumulative: 14/14 issues FIXED, 8 files changed (+375/-226 lines)
- Compliance: 12/15 → 14/15 (93%)

---

## [5.5.017] — 2026-06-21 — SECURITY POSTFIX (12 SEC issues, Cycle 14)

- [SEC-001] Cookie → PropertiesService (deny-by-default AuthZ)
- [SEC-002] AuthZ guard on 13/13 destructive ops
- [SEC-003/010] RFC 6265 cookie charset sanitization
- [SEC-004/007] PII masking (MD5 hash, email mask)
- [SEC-005/009/011] Sheet Protection 4→8 sheets + Q_REVIEW range
- [SEC-006] API Key via x-goog-api-key header
- [SEC-008] OAuth Least Privilege: 10→6 scopes
- [SEC-012] fetchWithRetry_ body truncation (200 chars)
- Cumulative: Production Readiness 95% → 97% GO (Security Hardened)

---

## [5.5.016] — 2026-06-21 — PERFORMANCE FIX (13 issues, Cycle 13)

- [PERF-001] reprocessReviewQueue +LockService +TimeGuard +Checkpoint/Resume (BLOCKING)
- [PERF-002] findMatchingPerson_/findMatchingPlace_ +optPrefixMap O(N)→O(K)
- [PERF-003] populateAliasFromFactDelivery_ personIdToUuidMap O(N)→O(1)
- [PERF-004/005] findPersonCandidates/findPlaceCandidates Set<string> lookup
- [PERF-006] highlightHighPriorityReviews +optTargetRow single-row mode (95% reduction)
- [PERF-007] generatePersonAliasesFromHistory +Checkpoint/Resume
- [PERF-008] applyAllPendingDecisions LockService idiomatic pattern
- [PERF-009-013] batch stats, schema-bounded ranges, log buffer flushes

---

## [5.5.015] — 2026-06-21 — CRITICAL FIX (2 issues)

- [CRIT-007] factUpdateRow_ merge mode nullish coalescing
- [CRIT-008] applyReviewDecision delegate to resolveAndPersist_ gateway

---

## [5.5.014] — 2026-06-20 — DRIVER VERIFIED COLUMNS + ALIAS ENRICHMENT

- Added 2 columns in 3 sheets:
  - Source sheet (SCGนครหลวงJWDภูมิภาค): col 37-38 "ชื่อลูกค้าปลายทางจริง", "ชื่อสถานที่อยู่ลูกค้าปลายทางจริง"
  - DAILY_JOB (ตารางงานประจำวัน): col 29-30 (same names)
  - FACT_DELIVERY: col 32-33 "driver_verified_name", "driver_verified_addr"
- Match Engine: ชื่อดิบ match ตามปกติ (100%) + ถ้าชื่อจริงมี → สร้าง alias ใน M_ALIAS (confidence=100, source=DRIVER_VERIFIED)
- fetchDataFromSCGJWD → copyDriverVerifiedToDailyJob_ → DAILY_JOB col 29-30
- SRC_IDX 37→39, DATA_IDX 29→31, FACT_IDX 32→34

---

## [5.5.013] — 2026-06-20 — GOOGLE MAPS REFACTOR (2 issues)

- [REWRITE] 15_GoogleMapsAPI.gs เขียนใหม่ทั้งไฟล์ — ลบระบบ 3-layer cache + MAPS_CACHE sheet
- [ADD] เพิ่มสูตร Amit Agarwal 7 ตัว เป็น @customFunction:
  - GOOGLEMAPS_DISTANCE, GOOGLEMAPS_DURATION, GOOGLEMAPS_LATLONG
  - GOOGLEMAPS_ADDRESS, GOOGLEMAPS_REVERSEGEOCODE, GOOGLEMAPS_COUNTRY, GOOGLEMAPS_DIRECTIONS
- [REMOVE] ลบ MAPS_CACHE sheet จาก SCHEMA, SHEET, MAPS_CACHE_IDX, setupAllSheets
- Cache: CacheService.getDocumentCache TTL 6 ชม.
- Sheets: 20→19, IDX sets: 17→16, SCHEMA entries: 20→19, Functions: 313→311

---

## [5.5.012] — 2026-06-19 — ANTIPATTERN FIX + DOC SYNC

- [Anti-pattern #1] showVersionInfo() ล้าหลัง → แก้ให้แสดง v5.5.012 + Audit Cycles 9
- [Anti-pattern #2] CHANGELOG ไม่ sync → เพิ่ม v5.5.011 entry ใน 20 ไฟล์
- [Anti-pattern #3] Double normalization → resolvePerson รับ preNormResult parameter
- [Anti-pattern #4] headers.indexOf() → ใช้ REVIEW_IDX/FACT_IDX constants (79 refs)
- [Anti-pattern #5] validateConfig ไม่เรียก validateSchemaConsistency → เพิ่มการเรียก
- Standardize function count = 313 ทุกที่
- README.md ลบ broken cross-references

---

## [5.5.011] — 2026-06-19 — DATA CONSISTENCY + SHIPTONAME CLEAN + Q_REVIEW NAV

- [Data Consistency] เพิ่ม SCHEMA['SCGนครหลวงJWDภูมิภาค'] (37 คอลัมน์) ใน 02_Schema.gs
- [ShipToName Clean] findBestGeoByPersonPlace ผ่าน normalizePersonNameFull ก่อนค้นหา
- [Q_REVIEW Nav] buildRecommendedAction_ สร้าง ID จริง + handleRecommendClick_ นำทาง

---

## [5.5.010] — 2026-06-18 — CACHE HOTFIX + Q_REVIEW POST-PROCESSOR

- [Hotfix #1] saveChunkedCache_ แบ่ง putAll เป็น batch 5 chunks + ลด chunk size 90KB→80KB
- [Hotfix #2] loadAllPlaces_ ลบ fallback path ที่ใช้ cache.put ตรง — บังคับใช้ saveChunkedCache_
- [Hotfix #3] loadAllPlaceAliases_ ลบ fallback path เดียวกัน
- รวมฟังก์ชันจาก 22_AccuracyPatch.gs เข้า 12_ReviewService.gs:
  - extractFirstId_, safeExtractArr_, reprocessReviewQueue, analyzeReviewPatterns

---

## [5.5.009] — 2026-06-18 — DOC SYNC

- 12 .gs files มี DEPENDENCIES + ARCHITECTURE section ที่สะท้อน V5.5.007/V5.5.008
- 20 .md files อัปเดต V5.5.006 → V5.5.008
- 4 sections ครบในทุกไฟล์: PURPOSE, CHANGELOG, DEPENDENCIES, ARCHITECTURE

---

## [5.5.008] — 2026-06-18 — CACHE CLEANUP P2 (6 issues)

- [P2 #10] clearMapsCache flush hit_count ก่อน clear
- [P2 #11] flushLogBuffer_ ใน finally ของ 5 entry points (04, 16, 19, 20, 21)
- [P2 #12] populateGeoMetadata ใช้ invalidate แทน manual null
- [P2 #13] saveChunkedCache_ ล้าง orphaned chunks เมื่อขนาดข้อมูลลดลง
- [P2 #14] getCachedDistricts_ write-back to cache on miss
- [P2 #15] TH_GEO_POSTCODE chunk size byte-based (ยืนยันใน comment)

---

## [5.5.007] — 2026-06-18 — CACHE FIX P0+P1 (9 issues)

### P0 — Data Integrity (4)
- [P0 #1] invalidateAllGlobalCaches ล้าง 11 RAM caches (เดิม 6)
- [P0 #2] invalidateGeoDictCache ล้าง _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX
- [P0 #3] applyAllPendingDecisions มี invalidateSameDayDestCache_ + autoEnrichAliases
- [P0 #4] migrateStep1_AssignUuid_ ใช้ invalidateChunkedCache_ แทน raw removeAll

### P1 — Performance + Correctness (5)
- [P1 #5] invalidateGeoLatLngCache_ + เรียกจาก createGeoPoint
- [P1 #6] M_PLACE_ALL/M_PLACE_ALIAS_ALL แปลงเป็น chunked cache
- [P1 #7] 4 chunked writers ใช้ centralized saveChunkedCache_
- [P1 #8] CACHE_KEY 13 entries (เดิม 2)
- [P1 #9] safeCacheGet_/Put_/RemoveAll_ helpers ใน 14_Utils

---

## [5.5.006] — 2026-06-18 — CONSISTENCY SYNC (28 doc inconsistencies)

- Bump APP_VERSION/SCHEMA_VERSION 5.5.004 → 5.5.006
- Total lines: 13,752 → 13,919
- Total functions: 311 → 310
- Total sheets: 20
- Total IDX sets: 17
- SCHEMA entries: 19
- Compliance: 16/16 PASS
- Production readiness: 95% GO
- Helper functions: 190 (18 SRP + 172 REFACTOR)

---

## [5.5.005] — 2026-06-16 — REVIEW SERVICE FIX (intermediate)

- v5.5.005 fix ใน ReviewService สำหรับ applyReviewDecision

---

## [5.5.004] — 2026-06-15 — INITIAL AUDIT CYCLES (53 audit issues)

5 audit cycles complete:
- CRITICAL → PERFORMANCE → SECURITY → REVIEW15 → REFACTOR
- 53 issues fixed across 22 files
- 321 functions, ~17,399 lines

---

## Architecture Constraints (All Versions)

- **Trinity Framework**: Person_ID + Place_ID + Geo_ID = Destination Node
- **Single Writer Pattern**: M_ALIAS เขียนที่ 10_MatchEngine (autoEnrich) + 21_AliasService (createGlobalAlias) + 19_Hardening (generatePersonAliasesFromHistory) เท่านั้น
- **16 Immutable Laws**: Clean Code, SRP, No Hardcode Index, Batch Ops, Checkpoint/Resume, etc.
- **Module Boundary**: Group 1 (Master DB) ↔ Group 2 (Daily Ops) — Pure Consumer
- **3-Layer Cache**: RAM → CacheService (chunked) → Sheet
- **6 OAuth Scopes** (Least Privilege since V5.5.020)

---

*This file is the Single Source of Truth for LMDS V5.5 version history.
Per-file .gs CHANGELOG headers reference this file and show only the latest 3 versions.*
