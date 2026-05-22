# Goal 2026-05-23: Dashboard/HMI Screenshots and Thesis Repair

ไฟล์นี้บันทึกคำสั่งกลางของ goal รอบนี้ เพื่อป้องกันการลืม scope ระหว่างทำงานระยะยาว

## กฎหลัก

- ห้ามลบไฟล์เก่าแล้วแทนที่ทันที ถ้าต้องทำใหม่ทั้งส่วนให้สร้าง archive ของไฟล์/โฟลเดอร์เดิมก่อนเสมอ
- งาน thesis ต้องทำทีละบทและทีละหัวข้อย่อย ไม่ทำรวดเดียวจนเนื้อหาหาย
- ต้องตรวจจาก current worktree และ runtime จริงก่อนสรุปว่างานเสร็จ
- เมื่อต้อง copy จาก path ที่ผู้ใช้ระบุ ให้ copy เท่านั้น ห้ามแก้ไขไฟล์ต้นทางใน folder ที่ผู้ใช้ให้
- Final verification ต้อง compile LaTeX เต็มรอบและตรวจ PDF ที่ render แล้ว ไม่ดู log อย่างเดียว

## Objective จากผู้ใช้

1. Screenshot ทุกระบบในทุก role สำหรับหัวข้อ 3.7 Dashboard และ HMI ตามบทบาทผู้ใช้ โดยเข้า `http://localhost:3000/admin` จาก session admin ที่ผู้ใช้ login ค้างไว้ ใช้ระบบ act เป็น role ต่าง ๆ อย่างละ 1 user เพื่ออธิบายการใช้งานฟังก์ชันของแต่ละ role ถ้าฟังก์ชันทับซ้อนกันให้อธิบายครั้งเดียวใน Admin เช่น Task Operation หรือ Patient / Staff Profile View และ capture หน้า Patient dashboard ใหม่เพราะภาพเดิมผิด รวมถึงสอนการใช้งาน Ease AI ในระบบ

2. แก้ทุกบททุกหัวข้อย่อยให้ประโยคแรกและประโยคกลางย่อหน้าด้วย 1 tab ตามรูปแบบการเขียนภาษาไทยในตัวอย่าง

3. เพิ่มรายละเอียดหัวข้อ 4.3 การทดสอบ Indoor Localization ด้วย KNN โดยอ้างอิงจาก `C:\Users\worap\Documents\TSE\Innovation-competition\PaperIEEE` แก้รูปที่ 3.9 ให้เป็นแค่ 4 ห้องและติด sensor ตรงกลางเหมือนในเล่มวิจัย และใส่ PaperIEEE ของผู้ใช้ไว้ในภาคผนวกท้ายสุดแบบแปะ paper 2 หน้า

4. เขียนวงรอบการทำงานของ `firmware/Node_Tsimcam/` และอธิบายในบทที่ 3

5. ย้ายรูปที่ 1.1 และ 1.2 ให้แทรกอยู่ในเนื้อหาที่เกี่ยวข้อง ไม่วางลอยแยกออกจากคำอธิบาย

6. เพิ่มภาพประกอบบทที่ 2 อีกประมาณ 5-6 ภาพ โดยใช้ภาพจริง/ภาพประกอบจากแหล่งที่เกี่ยวข้อง ไม่ใช้ TikZ สร้างรูป และให้ค้นหา/ตรวจภาพด้วย browser/playwright ตามความเหมาะสม

7. ตัดประโยคเกริ่นนำบทที่ 2 นี้ออก: "เนื้อหาในบทนี้จึงทำหน้าที่เป็นฐานทฤษฎีสำหรับการออกแบบระบบในบทที่ 3 และการประเมินผลในบทที่ 4 โดยไม่ลงรายละเอียดระดับ implementation มากเกินจำเป็น"

8. เอา appendix ที่มีและรูปบางรูปจาก version เก่าที่ `C:\Users\worap\Documents\TSE\LE402\Thesis\latex\content\appendices` มาใช้ โดยห้ามยุ่งกับภาคผนวก ก และเริ่มใส่ตั้งแต่ภาคผนวก ข เป็นต้นไป ต้อง copy เท่านั้น ห้ามแก้ไฟล์ใน folder ต้นทาง

9. ทำรูปที่ 3.4 ใหม่ เพราะภาพตำแหน่งเชิงแนวคิดของ M5StickC Plus2 ตอนนี้ดูไม่ออก

## Deliverables

- Markdown command center file นี้ใน `Thesis`
- ภาพ screenshot dashboard/HMI แยกตาม role และฟังก์ชัน
- เนื้อหา Chapter 1-5 และ appendices ที่ปรับตามคำสั่ง
- ภาพใหม่/ภาพที่ copy มาอยู่ใน asset folder ของ thesis เท่านั้น
- Archive ของไฟล์เดิมก่อนแก้ส่วนใหญ่
- PDF ที่ compile ผ่านและ visual QA แล้ว

## Initial Work Plan

1. สำรวจสถานะ repo, thesis, frontend runtime และไฟล์อ้างอิงภายนอก
2. สร้าง archive snapshot ของไฟล์ thesis ที่จะถูกแก้
3. Capture dashboard/HMI ทุก role จาก runtime จริง และจัดเก็บ asset
4. ปรับ Chapter 3.7 และภาพ Patient dashboard/Ease AI
5. ปรับ Chapter 1, Chapter 2, Chapter 3, Chapter 4, appendices ตามรายการที่เหลือ
6. Compile เต็มรอบและตรวจ PDF ด้วย rendered pages
