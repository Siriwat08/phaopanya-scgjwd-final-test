# 🚀 Project Overview
**Logistics Master Data System (LMDS) V5.5** คือระบบจัดการฐานข้อมูลหลักด้านการขนส่ง (Master Data & Matching Engine) เป้าหมายคือรับข้อมูลการจัดส่งดิบที่ "ชื่อและที่อยู่สกปรก" นำมาทำความสะอาด (Cleanse) จับคู่กับฐานข้อมูลหลัก และคืนค่าพิกัด (Lat/Long) ที่ถูกต้อง 100% กลับไปให้ฝ่ายปฏิบัติการนำไปใช้

# 🛠️ Tech Stack & Environment
- **Environment:** Google Apps Script (V8 Engine)
- **Database:** Google Sheets (ใช้งานเสมือน RDBMS)
- **APIs:** Google Maps API (Geocoding), Gemini API (AI Reasoning)

# 📂 Architecture & Domain Separation
โปรเจกต์มี 22 ไฟล์ (`00_App` ถึง `21_AliasService`) รวม 312 ฟังก์ชัน ~16,926 บรรทัด แบ่ง Domain ชัดเจน ห้ามก้าวก่ายกัน:
1. **🟩 Group 1 (The Brain & Master DB):** `05` ถึง `10`, `16`, `20`, และ `21`
   - *หน้าที่:* ทำความสะอาดข้อมูล, จับคู่ (MatchEngine), เป็นเจ้าของฐานข้อมูล `M_PERSON`, `M_PLACE`, `M_GEO_POINT`, `M_ALIAS`
   - *รวมถึง:* `16_GeoDictionaryBuilder` (สร้างพจนานุกรมภูมิศาสตร์สำหรับ Master DB) และ `20_ThGeoService` (บริการข้อมูลภูมิศาสตร์ไทยสำหรับ Master DB)
2. **🟦 Group 2 (Daily Ops & Consumers):** `04`, `11`, `12`, `13`, `15`, `17`, `18`
   - *หน้าที่:* โหลดงานประจำวันจาก API (`18_ServiceSCG`), ส่ง `SHIP_TO_NAME` ไปหาพิกัด (`17_SearchService`), อ่าน/กรองข้อมูลดิบ (`04_SourceRepository`), จัดการ FACT_DELIVERY (`11_TransactionService`), Geocoding (`15_GoogleMapsAPI`)
   - *กฎเหล็ก:* Group 2 เป็น **ผู้บริโภคเท่านั้น** ห้ามเขียนข้อมูลลงตาราง Master (Group 1) โดยเด็ดขาด
3. **⚙️ System & Schema:** `00`, `01`, `02`, `03`, `14`, `19`
   - *หน้าที่:* เก็บ Config, โครงสร้างดัชนี (`DATA_IDX`), และฟังก์ชัน Utility

# 🔄 Core Workflows
- **Daily Flow (Group 2):** รัน `fetchDataFromSCGJWD()` -> โหลด API -> แกะ `SHIP_TO_NAME` ไปหาพิกัด -> วางพิกัดที่ไว้ใจได้ลงคอลัมน์ `LatLong_Actual`
- **Master Flow (Group 1):** นำข้อมูลที่จบงานแล้ว (พิกัดคนขับ 100%) มาเรียนรู้ -> รัน `runMatchEngine()` -> เขียนลง `M_ALIAS` (Single Writer)

# 💻 Build, Test & Run Commands
เนื่องจากเป็น Apps Script การรันและทดสอบจะทำผ่านเมนู UI บน Google Sheets:
- `🟩 กลุ่ม 1` -> `รันระบบจับคู่อัตโนมัติ (Match Engine)`
- `🟦 กลุ่ม 2` -> `โหลดข้อมูล Shipment ล่าสุด`
- **ดู Logs:** เปิดไปที่ชีต `SYS_LOG`

# 🎨 Code Style & Conventions
- **Clean Code:** `camelCase` สำหรับตัวแปร/ฟังก์ชัน, แยกฟังก์ชันให้สั้น (SRP)
- **Namespace:** ป้องกันชื่อฟังก์ชันซ้ำข้ามไฟล์ ใส่ Prefix ตามชื่อโมดูลเสมอ
- **Full File Output (MANDATORY):** ห้ามใช้ `...` หรือละเว้นโค้ดส่วนเดิม AI ต้อง output โค้ดเต็มไฟล์ตั้งแต่บรรทัดแรกจนบรรทัดสุดท้ายเสมอ!

# 🚫 Rules (Do Not Break - Zero Tolerance)
1. **No Hardcoded Index:** ห้ามใช้ดัชนีตัวเลขตรงๆ (เช่น `row[28]`) ต้องใช้ Index จาก `01_Config` เสมอ (เช่น `row[DATA_IDX.SHOP_KEY]`)
2. **Single Writer Pattern:** ห้ามโมดูลอื่นเขียนข้อมูลลงตาราง `M_ALIAS` ยกเว้น `10_MatchEngine` และ `21_AliasService`
3. **Batch Operations Only:** ห้ามใช้ `setValue()` หรือ `appendRow()` ในลูป ให้ใช้ `setValues()` แบบ batch array เท่านั้น

# ⏳ Execution & Constraints (GAS Limits)
- **6-Minute Limit:** สคริปต์รันได้สูงสุด 6 นาที ฟังก์ชันที่ลูปยาวหรือดึง API เยอะ ต้องมี `hasTimePassed_()` หุ้ม และใช้ Checkpoint/Trigger เพื่อทำ Auto-resume
- **Cache Limit:** `CacheService` เก็บได้ 100KB หากข้อมูลใหญ่ให้เก็บแบบ Chunk หรือใช้ RAM Cache

# 🛡️ Error Handling & Logging
- Entry Point ทุกตัว (เมนู/Trigger) ต้องหุ้มด้วย `try-catch` เสมอ
- ใน block catch ต้องบันทึก log ด้วย: `logError('ModuleName', e.stack)` ห้ามเกิด Silent Fail

# 🎯 Current Focus & Known Issues
- **Focus:** V5.5.015 post-CRITICAL-FIX — 12 audit cycles complete (CRITICAL → PERF → SECURITY → REVIEW15 → REFACTOR → SYNC → CACHE-FIX → CACHE-CLEANUP → DOC-SYNC → GOOGLE-MAPS-REFACTOR → DRIVER-VERIFIED → CRITICAL FIX), 77 code issues fixed (53 audit + 9 cache fix V5.5.007 + 6 cache cleanup V5.5.011 + 3 antipattern fixes V5.5.012 + 2 google maps refactor V5.5.013 + 2 driver verified cols V5.5.014 + 2 critical fix V5.5.015) across 22 files, function count 312, ~16,926 lines, production readiness 95%, 16/16 COMPLIANT
- **Gotchas:** ถ้าระบบขึ้นสีแดง `NOT_FOUND` ตอนโหลดงาน มักเกิดจาก Schema หัวคอลัมน์ในชีตไม่ตรงกับความยาวของ Array ในสคริปต์

# ⚖️ The 16 Immutable Laws (รัฐธรรมนูญของโปรเจกต์)
ห้ามเขียนหรือแก้ไขโค้ดใดๆ จนกว่าคุณจะได้อ่านและทำความเข้าใจกฎทั้ง 16 ข้อจากไฟล์อ้างอิงเหล่านี้:
1. ให้ดูสรุปกฎแบบตารางที่ไฟล์: `docs/📋 กฎการเขียนโค้ด LMDS V5.5.md`
2. ให้ดูคำอธิบายเชิงลึกและข้อห้าม (Anti-patterns) ที่ไฟล์: `docs/📋 กฎการเขียนโค้ด LMDS V5.5.md`
3. หากคุณละเมิดกฎแม้แต่ข้อเดียว (เช่น แอบใช้ Hardcode Index, แอบตัดทอนโค้ดด้วยจุดไข่ปลา, หรือแอบใช้ setValue ในลูป) โค้ดของคุณจะถูก Reject ทันที!
4. **กฎข้อ 16 (Security-First Design):** ห้ามเก็บ Secret ใน Cell, Destructive Op ต้องมี AuthZ Guard, PII ต้อง Masking, API Key ส่งผ่าน Header เท่านั้น

# 🛠️ โหมดการสั่งงานพิเศษ (AI Execution Commands)
โปรเจกต์นี้มีคู่มือการตรวจสอบโค้ดฉบับเต็ม (Master SOP) อยู่ที่ไฟล์:
👉 `docs/Code Reviewer สำหรับโปรเจกต์ LMDS.md`
เมื่อ User พิมพ์คำสั่งเหล่านี้ ให้คุณดึงกฎจาก SOP มาบังคับใช้และตอบกลับตาม Format ที่กำหนดทันที :
- `[CMD: BUGHUNT]` = สแกนโค้ดหาความเสี่ยง Critical & Performance ✅ ผ่านแล้ว
- `[CMD: REVIEW15]` = ประเมินตามกฎ 16 Immutable Laws อย่างละเอียด ✅ 16/16 COMPLIANT
- `[CMD: REFACTOR]` = วิเคราะห์ฟังก์ชันที่ยาวเกินไปและเสนอแผนการหั่นโค้ด ✅ 21 REF issues, 16 files changed
- `[CMD: PREDEPLOY]` = เช็คสถานะระบบครั้งสุดท้ายก่อนขึ้น Production ✅ PASSED (95% readiness)
