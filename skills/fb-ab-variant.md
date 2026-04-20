---
name: fb-ab-variant
description: Generate 1 main + 2 variant FB posts from same topic with contrasting angles
---

# fb-ab-variant — Variant Generator

## Mục đích

Từ 1 topic, output 3 bài với 3 góc nhìn khác nhau để CEO chọn. Mỗi variant có hook hoàn toàn khác — KHÔNG phải cùng bài reword.

## Angle taxonomy

1. **Educational** — dạy / giải thích. Hook = insight.
2. **Story** — kể chuyện. Hook = nhân vật hoặc tình huống.
3. **Question** — đặt câu hỏi. Hook = câu hỏi cho audience.
4. **Promotional** — ưu đãi trực tiếp. Hook = giá / deadline.
5. **Testimonial** — khách nói. Hook = trích lời khách.

## Rule generate

- **Main**: angle mạnh nhất theo `LEARNED_PATTERNS` (nếu có) hoặc `Educational` mặc định cho fresh install
- **Variant A**: angle ĐỐI LẬP main (Main=Educational → A=Story; Main=Story → A=Question)
- **Variant B**: short-form (< 80 từ), angle bất kỳ khác Main + A

## Rule enforcement

- Hook 3 variant KHÔNG được giống nhau (ngay cả reword)
- Main + A + B phải kể 3 câu chuyện phụ khác nhau về cùng 1 topic
- Nếu content-safety filter trim bỏ Main → variants A+B vẫn ship (spec allows 0-2 variants)
- Nếu cả 3 đều fail → generator returns empty, main.js alert CEO

## Output format

JSON schema đã định ở spec Section "Daily Generator Pipeline" — variants là array length 0-2.
