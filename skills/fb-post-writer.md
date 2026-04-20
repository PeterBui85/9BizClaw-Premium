---
name: fb-post-writer
description: Core Facebook post copy skill — hook structure, VN conversational tone, CTA, length, no-emoji default
---

# fb-post-writer — Core FB Post Writer

Áp dụng khi: bot soạn bài đăng Facebook cho Fanpage của CEO.

## Cấu trúc bắt buộc

**Hook — 2 dòng đầu (trước "See more" của FB):**
- Dòng 1: câu mở thu hút (không phải "Chào sếp, hôm nay..."), tối đa 80 ký tự
- Dòng 2: làm rõ giá trị / tình huống / mâu thuẫn
- Không dùng cliché ("Bạn có biết..." / "Bí quyết để..." / "Đừng bỏ lỡ..." trừ khi thật sự phù hợp)

**Body — thân bài (60-150 từ):**
- 1 ý chính, không dàn trải
- Dùng ngôi xưng phù hợp với ngành (xem fb-industry-voice)
- Câu ngắn 8-15 từ, tránh câu dài nhiều mệnh đề

**CTA — call to action:**
- Đặt ở dòng cuối
- Concrete: "Comment TUVAN để nhận báo giá" / "Nhắn inbox để đặt chỗ" / "Tag 1 người bạn đang tìm X"
- Tránh: "Hãy liên hệ chúng tôi" (mờ, không hành động được)

## Độ dài

80-200 từ là sweet spot. FB truncate ~400 ký tự bằng "See more" → dưới 400 ký tự là full-read, trên là click-more (giảm 40% engagement).

## Emoji — Hard Rule

**Mặc định: KHÔNG emoji.** 9BizClaw premium aesthetic — CEO brand cũng premium nếu content AI soạn không rơi vào pattern "fb page con chat template".

Ngoại lệ duy nhất: CEO prompt cụ thể ("viết bài vui có emoji") → 1-2 emoji chức năng (vị trí, đánh dấu), không emoji trang trí.

## Hashtag

1-3 hashtag max, đặt cuối bài. Chỉ tag nếu thật sự có cộng đồng search (ngành-specific, #tenCongTy). Không spam hashtag như Instagram.

## Checklist cuối

- Hook 2 dòng có giá trị rõ
- Body 1 ý chính, không dàn trải
- CTA cụ thể (hành động được)
- 80-200 từ
- Không emoji (trừ khi CEO opt-in)
- Không cliché mở đầu

## Ví dụ đạt (tone F&B)

> Khách quen bảo: "Bánh mì anh làm nhân nhiều hơn tháng trước à?"
> Em cười: "Giá bán vẫn vậy anh ơi."
>
> Hôm nay làm bánh mì thịt nguội, thêm 1/3 nhân so với tuần trước. Không tăng giá. Lý do đơn giản: giá thịt nguội em nhập giảm, em share bớt cho khách.
>
> Ghé em hôm nay, số lượng giới hạn.
> Inbox hoặc comment "ĐẶT" để giữ phần.

## Ví dụ KHÔNG đạt

> Chào cả nhà ơi! Hôm nay shop có bánh mì siêu ngon nhé! Bánh mì thịt nguội đầy đủ topping siêu xịn luôn. Cả nhà ghé ủng hộ shop nhé! Yêu cả nhà nhiều!

Lý do fail: cliché mở, emoji-adjacent tone, không hook cụ thể, CTA mờ.
