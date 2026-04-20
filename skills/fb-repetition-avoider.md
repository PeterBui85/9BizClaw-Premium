---
name: fb-repetition-avoider
description: Extract topics + angles from last 14 days posts, instruct generator to pick different
---

# fb-repetition-avoider — Repetition Detector

Input: mảng `recentPosts` (14 ngày qua, fetch từ Graph `/me/posts`) + performance history.

## Nhiệm vụ

Extract + output 3 bucket cho generator:

```
RECENT_TOPICS (14 days):
- iPhone 15 Pro (3 posts)
- Khuyến mãi Tết (2 posts)
- Customer testimonial (1 post)

RECENT_ANGLES:
- Educational (4 times)
- Promotional (3 times)
- Story (0 times)  ← gap, ưu tiên

HARD_AVOID:
- Cùng sản phẩm iPhone 15 Pro (đã post 3/14 ngày)
- Cùng angle "bảng giá" (post hôm qua)
```

## Rules

- Hard rule: KHÔNG post cùng sản phẩm 2 ngày liên tiếp
- Soft rule: nếu angle X đã dùng 3+ lần / tuần qua → prefer angle khác
- Nếu recentPosts rỗng (fresh install, page mới): không constraint, skip output

## Thuật toán extract topic (heuristic)

1. Tokenize title + first 50 từ
2. Match keyword list từ `knowledge/san-pham/index.md` → topic = SP match được
3. Không match → topic = "chủ đề chung"

## Output format (inject vào system prompt)

Tạo block text "RECENT CONTENT ANALYSIS" với 3 bucket trên. LLM tự decide angle dựa trên signal.
