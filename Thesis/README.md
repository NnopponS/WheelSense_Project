# WheelSense (โครงงาน / วิทยานิพนธ์)

รีโพซิทอรีนี้เป็นโครงงาน **WheelSense** เรื่อง *การพัฒนาระบบต้นแบบของสภาพแวดล้อมอัจฉริยะสำหรับผู้ใช้เก้าอี้รถเข็น* โฟลเดอร์รากของโปรเจกต์คือโฟลเดอร์นี้ (เนื้อหาเดิมจาก `WheelSense-Thesis` ถูกย้ายมาไว้ที่รากแล้ว)

อ้างอิงแม่แบบรายงาน LaTeX ของภาควิชาวิศวกรรมไฟฟ้าและคอมพิวเตอร์ โดยเอกสารหลักจัดทำด้วย LaTeX

โฟลเดอร์ [`Example/reporttemplate-0.0.1/`](Example/reporttemplate-0.0.1/) เป็น **สำเนาอ้างอิง** ของแม่แบบทางการ [tueceproj/reporttemplate](https://github.com/tueceproj/reporttemplate) แท็ก **v0.0.1** (โครงสร้างไฟล์ภายใต้ `latex/` เทียบกับโปรเจกต์นี้ได้: โปรเจกต์ใช้ `meta/info.tex` และพาธ `content/...` ตามที่จัดโครงใน `latex/` ที่นี่) — ใช้เปรียบเทียบรูปแบบกับไฟล์หลัก [`latex/thesis.tex`](latex/thesis.tex) เท่านั้น ไม่ได้คอมไพล์เป็น PDF ของวิทยานิพนธ์นี้

## ไฟล์ที่ต้องเขียน

1. `latex/meta/info.tex`

   - กำหนดค่าชื่อ ข้อความ รายละเอียดต่าง ๆ ของโครงงาน

2. `latex/thesis.tex`

   - ไฟล์หลัก
   - ปิดหรือเปิด comment/uncomment เพื่อ
     - เปลี่ยนสถานะรายงาน (นำเสนอ/ความก้าวหน้า 1/ความก้าวหน้า 2/สมบูรณ์)
     - เพิ่มภาคผนวก

3. `latex/content/chapters/chapter[1-5].tex`

   - เนื้อหาแต่ละบทของรายงาน

4. `latex/content/frontmatter/*.tex`

   - บทคัดย่อ กิตติกรรมประกาศ และคำย่อ

5. `latex/bib/refs.bib`

   - ข้อมูลรายการอ้างอิง

## คอมไพล์ในเครื่อง

จากโฟลเดอร์ `latex`:

```bash
xelatex -interaction=nonstopmode thesis.tex
biber thesis
xelatex -interaction=nonstopmode thesis.tex
xelatex -interaction=nonstopmode thesis.tex
```

### คู่มือตัวอย่างการเขียน LaTeX (ไม่ใช่ส่วนของวิทยานิพนธ์)

เนื้อหาตัวอย่าง (รายการ รูป ตาราง การอ้างอิง) อยู่ที่ `latex/doc/latex-writing-guide-chapter.tex` และคอมไพล์แยกเป็น PDF ผ่านไฟล์หลัก `latex/latex-writing-guide.tex` จากโฟลเดอร์ `latex`:

```bash
xelatex -interaction=nonstopmode latex-writing-guide.tex
biber latex-writing-guide
xelatex -interaction=nonstopmode latex-writing-guide.tex
xelatex -interaction=nonstopmode latex-writing-guide.tex
```

## การใช้งานไฟล์แม่แบบนี้กับ Overleaf

[Overleaf][overleaf url] เป็นโปรแกรมแก้ไขไฟล์ LaTeX ที่ทำงานร่วมกันบนคลาวด์ ใช้สำหรับการเขียน แก้ไข และเผยแพร่เอกสารทางวิทยาศาสตร์

การใช้งานไฟล์แม่แบบนี้กับ [Overleaf][overleaf url]:

1. [ดาวน์โหลดไฟล์ล่าสุด](https://github.com/tueceproj/reporttemplate/archive/master.zip) เป็นไฟล์ zip, หรือไปที่ [รุ่นล่าสุด](https://github.com/tueceproj/reporttemplate/releases/latest) แล้วดาวน์โหลดไฟล์ **Source code (zip)** รุ่นล่าสุด มาเก็บไว้ที่อุปกรณ์ของคุณ.
2. ไปที่เว็บ [Overleaf](https://www.overleaf.com/).
   - **ล็อกอิน**
     - แนะนำให้ใช้บัญชีอีเมลกูเกิลของคณะฯ (xxxxxxxxxx@student.tu.ac.th)
   - หรือ **ลงทะเบียน** ถ้าต้องการบัญชีใหม่กับ [Overleaf][overleaf url].
     - ลงทะเบียนฟรี

หลังจากล็อกอินเข้าเว็บของ [Overleaf][overleaf url]:

1. คลิก **New Project**.
   - เลือก **Upload Project**.
2. เลือกอัปโหลดไฟล์ zip ที่ได้ดาวน์โหลดมาก่อนหน้านี้.
   - รอจนอัปโหลดไฟล์เสร็จ.
   - ไฟล์หลัก **thesis.tex** จะถูกเลือกโดยอัตโนมัติ ถ้าไม่ ให้คลิกเลือกไฟล์นี้
   - เว็บจะพยายามคอมไพล์ไฟล์หลักให้อัตโนมัติ และเมื่อคอมไพล์เสร็จ จะแสดงข้อความที่เป็นข้อผิดพลาด
3. คลิก **Menu**.
   - ในหัวข้อ **Settings**, เปลี่ยน **Compiler** ให้เป็น **XeLaTeX**.
4. คลิก **Recompile**.
   - อาจใช้เวลาสักครู่ในการคอมไพล์.
   - หลังคอมไพล์เสร็จ เว็บจะแสดงไฟล์ผลลัพธ์แบบ PDF ให้โดยอัตโนมัติ.
   - อาจมีข้อความคำเตือนหลังการคอมไพล์. คำเตือนหล่านี้สามารถปล่อยไว้ได้.

[overleaf url]: https://www.overleaf.com/
