# 📋 กฎการเขียนโค้ด LMDS V5.5 (16 ข้อ — ฉบับสมบูรณ์และละเอียด)

> **เป้าหมาย:** โค้ดสะอาด บำรุงรักษาง่าย ปลอดภัย ทำงานได้จริงใน GAS (Time Limit 6 นาที, Shared Global Scope) และทีมพัฒนาสามารถทำงานร่วมกันได้โดยไม่ชนกัน

กฎเหล่านี้ถูกสร้างขึ้นจากประสบการณ์จริงในการพัฒนาโปรเจกต์ Logistics Master Data System ด้วย Google Apps Script

> **หลักการสำคัญ:** กฎทุกข้อเกิดจาก pain point ที่เจอระหว่างพัฒนา (เช่น ฟังก์ชันชื่อซ้ำกัน, index หาย, ข้อมูล timeout, การแก้ไขดึกแล้วลืมส่งโค้ดครบ) ไม่ใช่กฎสวยงามเฉย ๆ

---

## สารบัญ

1. [ข้อ 1 – Clean Code](#ข้อ-1--clean-code)
2. [ข้อ 1.1 – Function Length (ปรับปรุง)](#ข้อ-11--function-length-ปรับปรุง)
3. [ข้อ 2 – Single Responsibility](#ข้อ-2--single-responsibility)
4. [ข้อ 3 – No Hardcode Index](#ข้อ-3--no-hardcode-index)
5. [ข้อ 4 – Safe Batching](#ข้อ-4--safe-batching)
6. [ข้อ 5 – Resumable State](#ข้อ-5--resumable-state)
7. [ข้อ 6 – Use Dependency Map](#ข้อ-6--use-dependency-map)
8. [ข้อ 7 – Zero Hallucination](#ข้อ-7--zero-hallucination)
9. [ข้อ 8 – Namespace Collision Prevention](#ข้อ-8--namespace-collision-prevention)
10. [ข้อ 9 – No Cross-File Global Variables](#ข้อ-9--no-cross-file-global-variables)
11. [ข้อ 10 – Library Versioning](#ข้อ-10--library-versioning)
12. [ข้อ 11 – HTML Service Include Pattern](#ข้อ-11--html-service-include-pattern)
13. [ข้อ 12 – Error Handling per Entry Point](#ข้อ-12--error-handling-per-entry-point)
14. [ข้อ 13 – Logging with File & Line](#ข้อ-13--logging-with-file--line)
15. [ข้อ 14 – Structured File Naming](#ข้อ-14--structured-file-naming)
16. [ข้อ 15 – Full Version Only](#ข้อ-15--full-version-only)
17. [Quick Reference Checklist](#-quick-reference-checklist)
18. [ตารางสรุป](#-ตารางสรุป)
19. [เมื่อไม่แน่ใจ](#-เมื่อไม่แน่ใจ)

---

## ข้อ 1 – Clean Code (ตั้งชื่อให้สื่อความหมาย, camelCase, ฟังก์ชันสั้น)

### กฎ
- ชื่อตัวแปรและฟังก์ชันเป็นภาษาอังกฤษ **camelCase** (เช่น `normalizePersonName`, `loadAllPlaces_`)
- ความยาวตัวแปร/ฟังก์ชัน **ไม่ควรเกิน 30 ตัวอักษร** (ยกเว้นชื่อที่สื่อความหมายจำเป็น)
- **1 ฟังก์ชันทำ 1 อย่าง** และมีความยาวไม่เกิน 30 บรรทัด (เว้นแต่ได้รับอนุมัติเป็นลายลักษณ์อักษร — ดูข้อ 1.1)

### เหตุผล
- GAS ไม่มี linter อัตโนมัติในตัว Editor การตั้งชื่อให้ดีช่วยให้รู้ว่าตัวแปรนั้นคืออะไรโดยไม่ต้องไปไล่อ่านทั้งไฟล์
- ฟังก์ชันสั้น ๆ ทำให้ test และ debug ได้ง่าย และลดโอกาสผิดพลาดจากการแก้ไขหลายจุดพร้อมกัน

### Pattern

```javascript
// ✅ ถูกต้อง — ชื่อสื่อความหมาย + camelCase
function normalizePersonName(rawName) {
  var name = String(rawName).trim();
  return name.replace(/\s+/g, ' ');
}

function loadAllPlaces_() {
  return SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('Places')
    .getDataRange()
    .getValues();
}

// ❌ ผิด — ชื่อไม่สื่อความหมาย
function process(x) {
  var temp = x[0];
  var data = temp.split(',');
  return data;
}
```

### การละเมิดที่พบบ่อย
- ตั้งชื่อ `data`, `temp`, `x` — ไม่สื่อความหมาย
- ฟังก์ชันเดียวทำหลายอย่าง (normalize + validate + save)

---

## ข้อ 1.1 – Clean Code & Function Length (ปรับปรุง — ขออนุมัติเมื่อยาวเกิน 30)

> **กฎข้อ 1.1 เพิ่มเติมจากข้อ 1:** หากฟังก์ชันจำเป็นต้องยาวเกิน 30 บรรทัด ต้องขออนุมัติก่อน

### กฎ
- ใช้ `camelCase` สำหรับชื่อตัวแปรและฟังก์ชัน
- ชื่อต้องสื่อความหมาย (ห้ามใช้ `data`, `temp`, `x` โดยไม่มีคำอธิบาย)
- ความยาวฟังก์ชัน **ไม่ควรเกิน 30 บรรทัด** เว้นแต่จำเป็น
- **หากฟังก์ชันจำเป็นต้องยาวเกิน 30 บรรทัด:**
  1. แจ้งผู้ใช้ล่วงหน้า (ระบุชื่อฟังก์ชัน, บรรทัดที่, เหตุผล)
  2. รออนุมัติจากผู้ใช้ก่อน (ถามว่าให้คงไว้หรือแยก)
  3. ถ้าอนุมัติให้คงไว้ → สามารถส่งโค้ดตามนั้นได้ (ไม่ต้องบังคับแยก)

### ตัวอย่างที่ได้รับอนุมัติแล้ว

**ฟังก์ชัน `normalizePersonNameFull()` (ยาว ~65 บรรทัด)**

เหตุผลที่ควรคงไว้ (ไม่แยก):
- ตรรกะการทำความสะอาดชื่อมี **7 ขั้นตอนต่อเนื่องกัน** ซึ่งต้องใช้ตัวแปรร่วมกัน
- การแยกเป็นฟังก์ชันย่อยจะต้องผ่านพารามิเตอร์หลายตัวและ return หลายค่า ทำให้โค้ดซับซ้อนขึ้นโดยไม่จำเป็น
- ฟังก์ชันนี้เป็น pure transformation function (ไม่มี side effect) และถูกเรียกทีละแถว การอยู่ในฟังก์ชันเดียวช่วยให้ debug และทำความเข้าใจ workflow ได้ง่าย
- **ความเสี่ยงในการแยก:** โค้ดจะซับซ้อนขึ้น ต้องส่งผ่าน object กลับไปกลับมา เสี่ยงเพิ่ม bug โดยไม่จำเป็น

---

## ข้อ 2 – Single Responsibility (1 ฟังก์ชัน = 1 หน้าที่)

### กฎ
- ฟังก์ชันหนึ่งมีหน้าที่เดียว สามารถอธิบายเป็นประโยคสั้น ๆ โดยไม่ต้องใช้คำว่า "และ"
- ถ้าฟังก์ชันจำเป็นต้องทำหลายอย่าง ให้แยกเป็นฟังก์ชันย่อย (private function ที่ขึ้นต้นด้วย `_`)

### เหตุผล
- เวลามี bug จะได้รู้ว่าต้องไปแก้ที่ฟังก์ชันไหนโดยไม่กระทบส่วนอื่น
- การ test ทำได้ง่ายขึ้น

### Pattern

```javascript
// ✅ ถูกต้อง — แยกหน้าที่ชัดเจน
function processPersonRow(row) {
  var normalized = normalizePersonName_(row[0]);
  var validated  = validatePhone_(normalized);
  return validated;
}

function normalizePersonName_(raw) {
  return String(raw).trim().replace(/\s+/g, ' ');
}

function validatePhone_(name) {
  return name.length > 0 ? name : null;
}

// ❌ ผิด — ทำหลายอย่างในฟังก์ชันเดียว
function processData(data) {
  // normalize + match + save + log
  var clean   = normalize(data);
  var matched = match(clean);
  save(matched);
  log('done');
}
```

### การละเมิดที่พบบ่อย
- ฟังก์ชัน `processData` ที่ normalize + match + save + log

---

## ข้อ 3 – No Hardcode Index (ห้ามระบุเลขคอลัมน์โดยตรง)

### กฎ
- ห้ามเขียนตัวเลขกำกับคอลัมน์ใน code โดยตรง (เช่น `row[7]`, `col === 11`)
- ให้ใช้ **constant object** (`PERSON_IDX`, `PLACE_IDX`, `DATA_IDX`, `SRC_IDX`) ที่ประกาศใน `01_Config.gs` เท่านั้น
- ถ้าต้องใช้ dynamic lookup (เช่น หา index จากชื่อคอลัมน์) ให้ใช้ฟังก์ชัน `getColIndex(schemaKey, colName)` ใน `02_Schema.gs`

### เหตุผล
- โครงสร้างชีตเปลี่ยนได้ (เพิ่ม/ลดคอลัมน์) ถ้า hardcode ไว้ ระบบจะพังทันที
- การรวม index ไว้ที่ `01_Config` ทำให้แก้ไขครั้งเดียวทั่วทั้งโปรเจกต์

### Pattern

```javascript
// ✅ ถูกต้อง — ใช้ constant
function processRow(row) {
  var name  = row[PERSON_IDX.NAME];
  var phone = row[PERSON_IDX.PHONE];
  return { name: name, phone: phone };
}

// หา index จากชื่อคอลัมน์
var colIndex = getColIndex('PERSON', 'Email');

// ❌ ผิด — hardcode
var name  = row[0];
var email = row[2];
sheet.getRange(2, 11, 100, 1).setValues(...);
```

### การละเมิดที่พบบ่อย
- `var name = row[10]`
- `sheet.getRange(2, 11, 100, 1).setValues(...)`

---

## ข้อ 4 – Safe Batching (ห้ามอ่าน/เขียนทีละแถวในลูป)

### กฎ
- **ห้ามใช้ `getValue()` / `setValue()` / `setBackground()` / `appendRow()` ในลูป**
- ให้ใช้ `getValues()`, `setValues()`, `setBackgrounds()` แบบ batch ครั้งเดียว
- ถ้าต้องอัปเดตข้อมูลจำนวนมาก ให้ใช้ **TextFinder** แทนการวนหา (`createTextFinder().findNext()`)
- ใช้ `chunkArray_()` helper สำหรับ batches ใหญ่ (>10,000 แถว)

### เหตุผล
- GAS มี Timeout ที่ 6 นาที การเรียก API ทุกแถวจะทำให้สคริปต์ค้างและไม่จบ
- Batch operations ลดจำนวน API calls จาก O(N) เหลือ O(1) ช่วยให้รันข้อมูลหลักพันแถวได้ทัน

### Pattern

```javascript
// ✅ ถูกต้อง — batch ครั้งเดียว
function updateAllNames(names) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Person');
  var range = sheet.getRange(2, PERSON_IDX.NAME + 1, names.length, 1);
  range.setValues(names.map(function(n) { return [n]; }));
}

// หรือใช้ TextFinder แทนการวนหา
function findAndUpdate() {
  var finder = sheet.createTextFinder('OLD_VALUE').matchEntireCell(true);
  var cells  = finder.findAll();
  cells.forEach(function(cell) { cell.setValue('NEW_VALUE'); });
}

// ❌ ผิด — เรียกในลูป
for (var i = 0; i < data.length; i++) {
  sheet.getRange(i + 2, 5).setValue(data[i][4]);
}
```

### การละเมิดที่พบบ่อย
- `setValue()` ทุกแถวใน for loop → Timeout แน่นอนเมื่อข้อมูลเกิน 500 แถว

---

## ข้อ 5 – Resumable State (รองรับการรันต่อเนื่องเมื่อเกือบ timeout)

### กฎ
- ทุกสคริปต์ที่รันนาน (ประมวลผลข้อมูล >1,000 แถว) ต้องมี **Checkpoint** และ **Resume Logic**
- ใช้ `PropertiesService` เก็บสถานะ (index, sourceRow) และอ่านกลับมาตอนเริ่มรัน
- มี `Time Guard` (ตรวจสอบเวลาผ่านไป ถ้าใกล้ 6 นาทีให้หยุดและบันทึก checkpoint)

### เหตุผล
- GAS ตัดสคริปต์ทันทีเมื่อครบ 6 นาที ถ้าไม่มี checkpoint ข้อมูลที่ประมวลผลไปแล้วจะสูญเปล่า
- การ resume ช่วยให้สามารถรันข้อมูล 10,000+ แถวได้ในหลายรอบ

### Pattern

```javascript
var CHECKPOINT_KEY = 'PIPELINE_INDEX';
var TIME_LIMIT_SEC = 5 * 60; // 5 นาที (เผื่อเวลา)

function runPipeline() {
  var state     = loadCheckpoint_();
  var startTime = Date.now();
  var totalRows = getDataRows_().length;

  for (var i = state.startIndex; i < totalRows; i++) {
    var row = getDataRows_()[i];
    processRow(row);

    // ⏰ Time Guard ทุก 100 แถว
    if (i % 100 === 0 && hasTimePassed_(startTime, TIME_LIMIT_SEC)) {
      saveCheckpoint_(i);
      logInfo('Checkpoint saved at row ' + i);
      return; // หยุดและรันต่อครั้งหน้า
    }
  }

  // ✅ งานเสร็จสมบูรณ์ — ลบ checkpoint
  clearCheckpoint_();
  logInfo('Pipeline completed');
}

function saveCheckpoint_(index) {
  PropertiesService.getScriptProperties()
    .setProperty(CHECKPOINT_KEY, index);
}

function loadCheckpoint_() {
  var idx = PropertiesService.getScriptProperties()
    .getProperty(CHECKPOINT_KEY);
  return idx ? { startIndex: parseInt(idx) } : { startIndex: 0 };
}

function clearCheckpoint_() {
  PropertiesService.getScriptProperties()
    .deleteProperty(CHECKPOINT_KEY);
}

function hasTimePassed_(startTime, limitSec) {
  return (Date.now() - startTime) / 1000 > limitSec;
}
```

### การละเมิดที่พบบ่อย
- ไม่มี `saveCheckpoint_()` ใน long loop
- รัน pipeline ใหม่แล้วเริ่มจากแถวแรกเสมอ (ไม่สน checkpoint)

---

## ข้อ 6 – Use Dependency Map (ระบุสิ่งที่ต้องพึ่งพา)

### กฎ
- ที่หัวของทุกไฟล์ (ในคอมเมนต์) ให้ระบุ **Dependencies** ว่าไฟล์นี้ใช้ constants อะไรจากไฟล์ไหน และใช้ฟังก์ชันอะไรจากไฟล์ไหน

### เหตุผล
- GAS รวม scope เดียวกัน (ทุกไฟล์อยู่ใน namespace เดียว) ทำให้รู้ยากว่าฟังก์ชัน/constant นี้มาจากไหน
- Dependency map ช่วยให้ debug และ refactor ง่ายขึ้น

### Pattern

```javascript
// ============================================================================
// 06_PersonService.gs
// ============================================================================
// ⚠️ Dependencies:
//   - SHEET, PERSON_IDX → 01_Config.gs
//   - normalizeForCompare, getCacheJson_ → 14_Utils.gs
//   - logInfo, logError → 03_SetupSheets.gs
//   - getColIndex → 02_Schema.gs
// ============================================================================

var PersonService = {
  resolvePerson: function(row) {
    // ...
  }
};
```

### การละเมิดที่พบบ่อย
- ไม่มีคอมเมนต์หัวไฟล์ — ต้องไปไล่หาว่า `logInfo` อยู่ไฟล์ไหน

---

## ข้อ 7 – Zero Hallucination (ห้ามสร้างฟังก์ชันที่ไม่มีอยู่จริง)

### กฎ
- ห้ามเรียกใช้ฟังก์ชันที่ยังไม่มี หรือที่ไม่มีอยู่ในโปรเจกต์ (เช่น สมมติว่ามี helper `advancedNormalizer` แต่ยังไม่มี)
- ถ้าจำเป็นต้องใช้ฟังก์ชันที่ยังไม่ implement ให้ **ถามก่อน** หรือสร้าง stub พร้อม `throw new Error('Not implemented')`

### เหตุผล
- ป้องกัน error เวลารัน (ReferenceError)
- บังคับให้ planning ก่อนลงมือเขียน

### Pattern

```javascript
// ✅ ถูกต้อง — สร้าง stub ก่อน
function advancedNormalizer_(input) {
  throw new Error('advancedNormalizer_ ยังไม่ได้ implement');
}

// ✅ ถูกต้อง — ถามก่อน
// TODO: ต้องใช้ getEmployeeEmail() — ยังไม่มีในโปรเจกต์ รบกวนสร้างให้ด้วย

// ❌ ผิด — สมมติว่ามีแต่จริงๆ ไม่มี
function getEmail(row) {
  return getEmployeeEmail(row.id); // ❌ ไม่มีฟังก์ชันนี้
}
```

### การละเมิดที่พบบ่อย
- สมมติว่ามี `getEmployeeEmail()` แล้วเรียกใช้ แต่ในโค้ดจริงใช้ `loadEmployeeEmailMap_()`

---

## ข้อ 8 – Namespace Collision Prevention (ป้องกันชื่อซ้ำข้ามไฟล์)

### กฎ
- หลีกเลี่ยงการประกาศฟังก์ชันชื่อเดียวกันในหลายไฟล์ เพราะ GAS รวม Global Scope
- ใช้ **Object Namespace** หรือ **Prefix** เช่น
  - `PersonService.resolvePerson()`
  - `PlaceService.findPlaceCandidates()`
  - `GeoService.resolveGeo()`
- สำหรับฟังก์ชันที่ต้องเรียกข้ามไฟล์บ่อย ๆ ให้รวมไว้ใน namespace เช่น `MatchEngine.runMatchEngine()`

### เหตุผล
- ถ้ามี `getData()` ทั้งในไฟล์ A และ B, GAS จะใช้ตัวสุดท้ายที่โหลด ทำให้ทำงานผิด
- Namespace ช่วยแบ่งแยกอย่างชัดเจน

### Pattern

```javascript
// ✅ ถูกต้อง — Object Namespace
var PersonService = {
  resolve: function(row) { /* ... */ },
  match:   function(name, data) { /* ... */ },
  validate: function(person) { /* ... */ }
};

var PlaceService = {
  findCandidates: function(query) { /* ... */ },
  resolve: function(placeData) { /* ... */ }
};

// หรือใช้ Prefix
function personResolve(row) { /* ... */ }
function placeFindCandidates(query) { /* ... */ }

// ❌ ผิด — ชื่อกว้างเกิน
function resolve(row) { /* ทำอะไร? */ }
function find(query)  { /* ทำอะไร? */ }
```

### การละเมิดที่พบบ่อย
- `function processRow()` อยู่ในหลายไฟล์ โดยไม่ได้ prefix → ทับกัน

---

## ข้อ 9 – No Cross-File Global Variables (ห้ามตัวแปรโกลบอลข้ามไฟล์)

### กฎ
- ถ้าต้องการใช้ข้อมูลร่วมกัน ให้ประกาศใน `01_Config.gs` (const) แล้วให้ทุกไฟล์อ้างอิงผ่าน namespace นั้น
- ห้ามประกาศตัวแปร global ในไฟล์อื่น (เช่น `var tempStore = {}`) เพราะเสี่ยงต่อการถูกทับ
- ใช้ **CacheService** หรือ **ส่งผ่าน parameter** แทน

### เหตุผล
- Global variables ใน GAS คือ shared state ที่แก้ไขได้ทุกไฟล์ ทำให้ debug ยาก

### Pattern

```javascript
// ✅ ถูกต้อง — ประกาศใน 01_Config.gs
var CONFIG = {
  SHEET_NAME: 'MasterData',
  CACHE_TTL: 300,
  BATCH_SIZE: 500
};

// ใช้ CacheService
function getCachedData(key) {
  var cache  = CacheService.getScriptCache();
  var cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  var data = loadFromSheet();
  cache.put(key, JSON.stringify(data), 300);
  return data;
}

// ❌ ผิด — global ในไฟล์อื่น
// ใน 06_PersonService.gs
var tempStore = {}; // ❌ ไม่ดี
```

### การละเมิดที่พบบ่อย
- `let cache = {};` ในไฟล์ A แล้วหวังว่าไฟล์ B จะเห็น

---

## ข้อ 10 – Library Versioning (ล็อคเวอร์ชันของ Library)

### กฎ
- ถ้าใช้ Library (Standalone Script ที่ import มา) ให้ **ระบุเวอร์ชัน** (ไม่ใช้ HEAD)
- เวลาอัปเกรด Library ให้ทดสอบก่อนแล้วค่อยเปลี่ยนเวอร์ชันใน Production

### เหตุผล
- การใช้ HEAD อาจทำให้ระบบพังเพราะ Library ถูกอัปเกรดโดยไม่ตั้งใจ

### Pattern

```javascript
// ✅ ถูกต้อง — ระบุเวอร์ชัน
var LDAP_AUTH_LIB = {
  id: 'MY_LIBRARY_ID',
  version: '8', // ✅ ไม่ใช่ 'HEAD'
  name: 'LdapAuth'
};

// ❌ ผิด — ใช้ HEAD
// เลือก "HEAD" ในเมนู Library → เสี่ยง!
```

### การละเมิดที่พบบ่อย
- เลือก "HEAD" ในเมนู Library

---

## ข้อ 11 – HTML Service Include Pattern (สำหรับ Web App / Sidebar)

### กฎ
- ถ้ามีหน้า HTML ให้แยกเป็นไฟล์ `.html` และใช้ฟังก์ชัน `include(filename)` เพื่อดึงเนื้อหามาใช้
- ห้าม hardcode HTML blocks ใน `.gs` (ทำให้อ่านยาก)

### เหตุผล
- แยก front-end ออกจาก back-end, จัดการโค้ดได้ง่าย

### Pattern

```javascript
// ✅ ถูกต้อง — แยก HTML เป็นไฟล์
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('LMDS Tools');
  SpreadsheetApp.getUi().showSidebar(html);
}

// Sidebar.html (ไฟล์แยก)
// <!DOCTYPE html>
// <html>
//   <head><base target="_top"></head>
//   <body>
//     <div class="sidebar">
//       <h3>LMDS Tools</h3>
//       <button onclick="runPipeline()">รัน Pipeline</button>
//     </div>
//   </body>
// </html>

// ❌ ผิด — hardcode HTML ใน .gs
var html = '<div><h1>Title</h1><p>Content...</p></div>';
```

### การละเมิดที่พบบ่อย
- `var html = '<div>' + longString + '</div>'` — ควายักษ์

---

## ข้อ 12 – Error Handling per Entry Point (try-catch ทุกฟังก์ชันบนเมนู)

### กฎ
- ฟังก์ชันที่ถูกเรียกจากเมนู (UI) **ต้องมี `try-catch`** และ log error ลง `SYS_LOG`
- ฟังก์ชัน utility (pure function) อาจไม่มี try-catch แต่ต้องมั่นใจว่าไม่ throw
- ทุก `catch` ต้องมี `logError` พร้อม stack trace

### เหตุผล
- ป้องกันไม่ให้สคริปต์เงียบ (silent fail) เมื่อ error เกิดขึ้น
- ทำให้ admin เห็นปัญหาใน `SYS_LOG`

### Pattern

```javascript
// ✅ ถูกต้อง — มี try-catch ที่ entry point
function onMenuRunPipeline() {
  try {
    logInfo('Starting pipeline...');
    runPipeline();
    logInfo('Pipeline completed');
  } catch (e) {
    logError('Pipeline failed: ' + e.message, e);
    showAlert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

// ✅ ถูกต้อง — ฟังก์ชันภายในอาจไม่ต้องมี
function processRow(row) {
  var normalized = normalizeName(row[0]); // ถ้า throw ให้ catch ที่ onMenu...
  return normalized;
}
```

### การละเมิดที่พบบ่อย
- `function runPipeline() { ... }` ไม่มี try-catch → เวลาพังไม่รู้สาเหตุ

---

## ข้อ 13 – Logging with File & Line (บันทึกชื่อไฟล์และบรรทัด)

### กฎ
- ทุก `logError` ควรมีชื่อไฟล์ (module) และ stack trace หรือ line number โดยประมาณ
- ใช้ `new Error().stack` หรือ `console.error` เพื่อให้เห็นตำแหน่ง

### เหตุผล
- GAS error log มักบอกแค่ "unknown function" การเพิ่ม context ช่วยให้แก้ไขได้เร็ว

### Pattern

```javascript
// ✅ ถูกต้อง — logError พร้อม context
function logError(message, error) {
  var context = {
    file: '06_PersonService.gs',
    error: message,
    stack: error && error.stack ? error.stack : new Error().stack
  };
  Logger.log(JSON.stringify(context));

  // หรือเขียนลง SYS_LOG sheet
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('SYS_LOG');
  sheet.appendRow([
    new Date(),
    'ERROR',
    '06_PersonService.gs',
    message,
    error && error.stack ? error.stack : ''
  ]);
}

// ❌ ผิด — ไม่มี context
function logError(message) {
  Logger.log(message); // ❌ ไม่รู้ว่ามาจากไหน
}
```

### การละเมิดที่พบบ่อย
- `logError` ธรรมดาไม่มี context → ต้องไปไล่หาสาเหตุเอง

---

## ข้อ 14 – Structured File Naming (ชื่อไฟล์สื่อถึง Responsibility)

### กฎ
- ตั้งชื่อไฟล์ตามหน้าที่ เช่น `01_Config.gs`, `06_PersonService.gs`, `14_Utils.gs`
- ใช้เลขนำหน้าสื่อถึงลำดับการโหลด (00-21) เพื่อให้เรียงใน Editor ได้ง่าย

### เหตุผล
- โปรเจกต์มีหลายไฟล์ ชื่อที่สื่อความหมายช่วยให้หาฟังก์ชันที่ต้องการได้เร็ว

### Pattern

```
✅ ถูกต้อง
├── 00_App.gs
├── 01_Config.gs
├── 02_Schema.gs
├── 03_SetupSheets.gs
├── 04_SourceRepository.gs
├── 05_NormalizeService.gs
├── 06_PersonService.gs
├── 07_PlaceService.gs
├── 08_GeoService.gs
├── 09_DestinationService.gs
├── 10_MatchEngine.gs
├── 11_TransactionService.gs
├── 12_ReviewService.gs
├── 13_ReportService.gs
├── 14_Utils.gs
├── 15_GoogleMapsAPI.gs
├── 16_GeoDictionaryBuilder.gs
├── 17_SearchService.gs
├── 18_ServiceSCG.gs
├── 19_Hardening.gs
├── 20_ThGeoService.gs
└── 21_AliasService.gs

❌ ผิด
├── code.gs
├── myScript.gs
├── Untitled.gs
└── test.gs
```

### การละเมิดที่พบบ่อย
- `code.gs`, `myScript.gs` — ไม่บอกอะไรเลย

---

## ข้อ 15 – Full Version Only (ห้ามตัดทอนโค้ด)

### กฎ
- ทุกครั้งที่ส่งโค้ดให้กัน (หรือ deploy) **ต้องเป็น Full File** ไม่มี `...` หรือ `// โค้ดส่วนเดิมไม่เปลี่ยนแปลง`
- ถ้าต้องการอธิบายการเปลี่ยนแปลง ให้เขียน comment แยก หรือใช้ diff tool

### เหตุผล
- การตัดโค้ดทำให้เกิด mismatch ระหว่างต้นฉบับกับไฟล์ที่ใช้งานจริง หากมี bug จะสืบหาสาเหตุยาก

### Pattern

```markdown
## การเปลี่ยนแปลงในไฟล์ 06_PersonService.gs

### ฟังก์ชัน resolvePerson (แก้ไข)
```javascript
// บรรทัด 15-25 — เดิม
function resolvePerson(row) {
  return row[0]; // ❌ ผิด: hardcode
}

// บรรทัด 15-25 — ใหม่
function resolvePerson(row) {
  return row[PERSON_IDX.NAME]; // ✅ ถูกต้อง: ใช้ constant
}
```

### ฟังก์ชันอื่นๆ (ไม่เปลี่ยน)
- `matchPerson()` - เหมือนเดิม
- `validatePerson()` - เหมือนเดิม
```

### Anti-Pattern ที่ห้าม

```javascript
// ❌ ห้ามเด็ดขาด
function myFunction() {
  // ... โค้ดส่วนเดิม ...
}

function oldFunction() {
  // ... ไม่เปลี่ยนแปลง ...
}
```

### การละเมิดที่พบบ่อย
- ส่งโค้ดด้วยรูปแบบ `"... โค้ดส่วนเดิม ..."` → ต้องก๊อปปี้เอง ผิดพลาดง่าย

---

### กฎข้อ 16: Security-First Design (เพิ่มใน V5.5.004)

1. **Secret Management** — ห้ามเก็บ Secret (Cookie, API Key, Password) ใน Spreadsheet Cell ต้องใช้ `PropertiesService.getScriptProperties()` เท่านั้น
2. **Authorization Guard** — Destructive Operation ทุกจุดต้องมี `isAuthorizedUser_()` Guard ก่อนดำเนินการ
3. **Input Sanitization** — ข้อมูลจากผู้ใช้ทุกชนิดที่จะส่งผ่าน HTTP Header ต้องผ่าน Sanitization ก่อน (เช่น `sanitizeCookie_()`)
4. **Data Minimization** — ห้ามบันทึก PII (อีเมลเต็ม, เบอร์โทร, ที่อยู่เต็ม) ลง SYS_LOG — ใช้ Masking (เช่น `maskReviewerEmail_()`)
5. **API Key in Header** — ส่ง API Key ผ่าน HTTP Header (`x-goog-api-key`) ไม่ใช่ URL Query Parameter (`?key=`)
6. **Protected Ranges** — ชีตที่มีข้อมูล PII ต้องตั้ง Protected Ranges + Hide Sheet จากผู้ใช้ทั่วไป

---

## 📋 Quick Reference Checklist

ให้ AI ตรวจสอบก่อนส่งโค้ดทุกครั้ง:

> ✅ **FIRST_AUDIT_REVIEW15 + REFACTOR (2026-06-12) ได้ดำเนินการเสร็จสิ้นแล้ว** — กฎข้อ 1, 2, 3, 5, 7, 9, 13 ที่เคยมีการละเมิด ได้รับการแก้ไขครบถ้วนแล้ว (SHOULD_FIX/NICE_TO_HAVE → PASS) ผล Compliance: 8/16 PASS → **16/16 COMPLIANT** (+8). REFACTOR cycle: 21 REF issues, 16 files changed. APP_VERSION = '5.5.011', SCHEMA_VERSION = '5.5.011'.

### Syntax & Naming
- [ ] ใช้ `camelCase` สำหรับชื่อทั้งหมด
- [ ] ชื่อสื่อความหมาย (ไม่ใช่ `data`, `temp`, `x`)
- [ ] ชื่อไฟล์เป็น `XX_Name.gs`
- [ ] ฟังก์ชันยาวเกิน 30 บรรทัด → ขออนุมัติก่อน (ข้อ 1.1)

### Data Access
- [ ] ไม่มี `row[7]`, `col === 11` (ใช้ `XXX_IDX`)
- [ ] ไม่มี `getValue()`/`setValue()` ในลูป
- [ ] ใช้ `getValues()`/`setValues()` แทน

### Functions
- [ ] ฟังก์ชันยาวไม่เกิน 1 หน้าจอ
- [ ] แยกหน้าที่ชัดเจน (ไม่มี "และ" ในคำอธิบาย)
- [ ] ไม่เรียกฟังก์ชันที่ไม่มีจริง
- [ ] มี `_` prefix สำหรับ helper functions

### Long-Running Scripts
- [ ] มี checkpoint + resume (ถ้ารัน >1,000 แถว)
- [ ] มี Time Guard ทุก 100 แถว

### Error Handling
- [ ] ฟังก์ชัน entry point (เมนู) มี try-catch
- [ ] `logError` มี stack trace

### Dependencies
- [ ] มี comment หัวไฟล์ระบุ dependencies
- [ ] ไม่ใช้ global variables ข้ามไฟล์
- [ ] ใช้ Object Namespace หรือ prefix

### File Quality
- [ ] ไม่มี `...`, `"โค้ดส่วนเดิม"` หรือ `// old code`
- [ ] ไม่ hardcode HTML ใน .gs

---

## 📌 ตารางสรุป

| ข้อ | ชื่อกฎ | สิ่งที่ต้องทำ | สิ่งที่ห้ามทำ | REVIEW15 |
|-----|--------|-------------|-------------|----------|
| 1 | Clean Code | camelCase, ชื่อสื่อความหมาย, ฟังก์ชันสั้น | data, temp, x | ✅ PASS |
| 1.1 | Function Length | ขออนุมัติเมื่อยาวเกิน 30 บรรทัด | ยาวโดยไม่แจ้ง | — |
| 2 | Single Responsibility | 1 ฟังก์ชัน = 1 หน้าที่ | รวมหลายอย่างในฟังก์ชันเดียว | ✅ PASS |
| 3 | No Hardcode Index | ใช้ `XXX_IDX` | `row[7]`, `col === 11` | ✅ PASS |
| 4 | Safe Batching | `getValues()`, `setValues()` | `getValue()`, `setValue()` ในลูป | — |
| 5 | Resumable State | Time Guard + saveCheckpoint_ | รันใหม่จากแถวแรกเสมอ | ✅ PASS (REFACTOR: +3 functions) |
| 6 | Dependency Map | Comment หัวไฟล์ | ไม่บอกว่าฟังก์ชันมาจากไหน | — |
| 7 | Zero Hallucination | stub ก่อน หรือถาม | เรียกฟังก์ชันที่ไม่มี | ✅ PASS |
| 8 | Namespace | Object หรือ prefix | ชื่อซ้ำข้ามไฟล์ | — |
| 9 | No Global State | ใช้ Config หรือ Cache | `var temp = {}` ในไฟล์อื่น | ✅ PASS (see note) |
| 10 | Library Version | ระบุเวอร์ชัน | ใช้ HEAD | — |
| 11 | HTML Files | แยกไฟล์ `.html` | hardcode HTML ใน .gs | — |
| 12 | Error Handling | try-catch ที่ entry point | ไม่ catch = silent fail | — |
| 13 | Logging | logError มี stack | log ธรรมดาไม่มี context | ✅ PASS |
| 14 | File Names | `XX_Component.gs` | `code.gs`, `test.gs` | — |
| 15 | Full Files | ไม่ตัดทอน | `...`, `"โค้ดเดิม"` | — |
| 16 | Security-First Design | PropertiesService, AuthZ Guard, Sanitization, Masking, API Header, Protected Ranges | Secret in Cell, PII in Log, API Key in URL | — |

> **หมายเหตุ:** คอลัมน์ REVIEW15 แสดงผลการตรวจสอบจาก FIRST_AUDIT_REVIEW15 + REFACTOR (2026-06-12) — ข้อ 1, 2, 3, 5, 7, 13 เคยมีการละเมิด (SHOULD_FIX) และได้รับการแก้ไขครบถ้วน → เปลี่ยนจาก SHOULD_FIX เป็น ✅ PASS. ข้อ 9 (No Global State) เคยเป็น NICE_TO_HAVE แต่หลัง REFACTOR ยืนยันว่า RAM caches ที่คงเหลือ (เช่น `_GLOBAL_GEO_DICT_CACHE`, `_ALIAS_ENRICHMENT_CONTEXT`) เป็นที่ยอมรับได้ตามสถาปัตยกรรม GAS ที่ไม่มี module system → ✅ PASS
>
> **REFACTOR patterns ที่นำมาใช้:**
> - `resolveAndPersist_` gateway pattern (REF-001): ฟังก์ชันกลางตรวจสอบว่าข้อมูลมีอยู่แล้วหรือยัง ถ้าไม่มีจึงสร้างใหม่และบันทึก ลดการเขียนซ้ำ
> - `cachedGeoLookup_` 3-layer cache pattern (REF-016): RAM Cache → CacheService → Sheet → API, ทำให้ `geocodeAddress()` และ `reverseGeocode()` เป็น thin wrappers

---

## 📞 เมื่อไม่แน่ใจ

ถ้าไม่แน่ใจว่าจะทำถูกต้องหรือไม่:

1. **ถามก่อน** — อธิบายสิ่งที่จะทำ แล้วรอ confirm
2. **ทำตาม Pattern** — ถ้ามี pattern ตัวอย่าง ให้ทำตามนั้น
3. **บอกทางเลือก** — ถ้ามีหลายวิธี ให้เสนอและถามว่าเลือกแบบไหน

---

> **เวอร์ชัน:** 5.5.011 (post-CACHE-CLEANUP) — รวมจาก 2 ไฟล์เดิม + ปรับปรูงข้อ 1.1 + อัปเดตล่าสุด V5.5.011
> **APP_VERSION:** '5.5.011' | **SCHEMA_VERSION:** '5.5.011'
> **อัปเดตล่าสุด:** 2026-06-18
> **ตัวอย่างโค้ดทั้งหมด:** Google Apps Script (JavaScript)
