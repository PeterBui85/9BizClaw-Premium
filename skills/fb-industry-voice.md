---
name: fb-industry-voice
description: Adjust FB post tone per industry active profile (F&B, SaaS, Edu, Retail, Real Estate)
---

# fb-industry-voice — Industry Voice Adjuster

Đọc `industry/active.md` + `knowledge/cong-ty/index.md` để match tone cho ngành đang active.

## Bảng tone theo ngành

| Ngành | Tone chính | Xưng hô CEO→khách | Emoji OK? | CTA hay dùng |
|---|---|---|---|---|
| F&B (ẩm thực) | Ấm áp, playful, visual-heavy | "em" / "mình" ↔ "anh/chị/bạn" | Không (per rule) | "Inbox đặt", "Ghé thử hôm nay" |
| SaaS / IT | Professional, benefit-focused, feature+use-case | "chúng tôi" ↔ "anh/chị", "quý khách" | Không | "Đăng ký demo", "Xem case study" |
| Giáo dục | Ấm, có uy, testimonial-driven | "nhà trường" / "team" ↔ "quý phụ huynh" / "bạn" | Không | "Đăng ký tư vấn", "Để lại số, em gọi lại" |
| Retail / Thương mại | Urgency + promotion, direct | "shop" / "em" ↔ "anh/chị" | Không | "Comment size + mã", "Inbox chọn" |
| Bất động sản | Data-driven, location-heavy, formal | "bên em" ↔ "quý khách" / "anh/chị" | Không | "Gọi ngay 090x xem nhà", "Inbox layout" |
| Dịch vụ tổng quát | Adapt tùy ngành con | Tùy | Không | Concrete action specific |

## Rules

- Nếu `industry/active.md` không có nhãn ngành rõ → default tone F&B-like (gần gũi) cho B2C, SaaS-like cho B2B (phân biệt qua knowledge/cong-ty/index.md)
- Không bao giờ mix tone giữa 2 bài cùng ngày (consistency)
- Không dùng từ kỹ thuật ngành khác (ví dụ SaaS không dùng "nhân" "topping" trong bài)

## Ví dụ per ngành (cùng topic: "giới thiệu sản phẩm X")

**F&B** — "Bún bò Huế ngày mưa, em nấu 5 tiếng hầm xương..."
**SaaS** — "Team CRM của bạn vẫn import lead bằng Excel? Tuần này chúng tôi ra tính năng sync Facebook Lead Ads tự động..."
**Giáo dục** — "Phụ huynh hỏi: con em đuối từ học kỳ 2, có kịp không? — Có, nếu bắt đầu trước tuần sau..."

## Checklist

- Tone match ngành active
- Xưng hô match ngành
- CTA style match ngành
- Không mix từ ngành khác
