'use strict';
const fs = require('fs');
const path = require('path');
const { getWorkspace } = require('./workspace');

// =====================================================================
// Persona compilation + bootstrap sync
// =====================================================================
// Compiles CEO's persona configuration into Markdown prompt text, and
// injects persona + shop-state data into SOUL.md / USER.md so the bot
// receives them on every message without extra file reads.

// --- Marker constants (private) ---
const _PERSONA_MARKER_START = '<!-- PERSONA-MIX-INJECT-START -->';
const _PERSONA_MARKER_END = '<!-- PERSONA-MIX-INJECT-END -->';
const _SHOPSTATE_MARKER_START = '<!-- SHOP-STATE-INJECT-START -->';
const _SHOPSTATE_MARKER_END = '<!-- SHOP-STATE-INJECT-END -->';
const _PROFILE_MARKER_START = '<!-- PROFILE-INJECT-START -->';
const _PROFILE_MARKER_END = '<!-- PROFILE-INJECT-END -->';

// --- compilePersonaMix(mix) ---
// Pure function: compiles persona config into human-readable Markdown prompt.
// Mix contains: region, voice, customer, traits[], formality (1-10),
// greeting/closing/phrases (optional custom text).
function compilePersonaMix(mix) {
  if (!mix || typeof mix !== 'object') mix = {};
  const voiceMap = {
    'em-nu-tre': { pronoun: 'em', gender: 'Nữ trẻ (20-28 tuổi). Giọng nhẹ nhàng, năng động, thân thiện.' },
    'em-nam-tre': { pronoun: 'em', gender: 'Nam trẻ (20-28 tuổi). Giọng thẳng thắn, nhanh nhẹn, lễ phép.' },
    'chi-trung-nien': { pronoun: 'chị', gender: 'Nữ trung niên (35-45 tuổi). Giọng chững chạc, chu đáo, tin cậy.' },
    'anh-trung-nien': { pronoun: 'anh', gender: 'Nam trung niên (35-45 tuổi). Giọng chững chạc, chuyên nghiệp, đáng tin.' },
    'minh-trung-tinh': { pronoun: 'mình', gender: 'Trung tính, không xác định giới tính. Thân thiện, lịch sự.' },
  };
  const customerMap = {
    'anh-chi': 'Gọi khách là "anh" / "chị" tùy giới tính.',
    'quy-khach': 'Gọi khách là "quý khách" — formal cao cấp.',
    'mình': 'Gọi khách là "mình" — casual, cùng cấp.',
  };
  // 15 traits grounded in Big Five (OCEAN) + customer service research.
  // Groups: Openness (3) + Conscientiousness (3) + Extraversion (3) +
  //         Agreeableness (3) + Service-specific (3).
  // Each description ties the trait to concrete bot behavior.
  const traitMap = {
    // Openness — cởi mở / sáng tạo
    'sang-tao':     '[Sáng tạo — Openness] Gợi ý alternative, đề xuất combo mới, kể câu chuyện về SP thay vì đọc spec khô khan',
    'thuc-te':      '[Thực tế — Openness] Thẳng vào vấn đề, không thêu dệt, không kể câu chuyện dài. Nói cái gì cần nói',
    'linh-hoat':    '[Linh hoạt — Openness] Điều chỉnh theo từng khách, không cứng nhắc theo template, adapt tone per customer',
    // Conscientiousness — chỉn chu / có tổ chức
    'chin-chu':     '[Chỉn chu — Conscientiousness] Kiểm tra kỹ, không miss chi tiết, xác nhận rõ ràng trước khi reply',
    'chu-dao':      '[Chu đáo — Conscientiousness] Để ý nhu cầu ngầm, gợi ý chủ động, hỏi han thêm ngoài câu hỏi của khách',
    'kien-nhan':    '[Kiên nhẫn — Conscientiousness] Không vội, giải thích chậm rãi, cho khách thời gian quyết định',
    // Extraversion — năng động / giao tiếp
    'nang-dong':    '[Năng động — Extraversion] Reply nhanh, tone tươi, tạo cảm giác shop đang "alive"',
    'diem-tinh':    '[Điềm tĩnh — Extraversion] Chậm rãi, bình tĩnh, tạo cảm giác yên tâm. Dùng cho tình huống khủng hoảng/nhạy cảm',
    'chu-dong':     '[Chủ động — Extraversion] Dẫn dắt conversation, gợi ý trước khi khách hỏi, upsell khéo',
    // Agreeableness — đồng cảm / hợp tác
    'am-ap':        '[Ấm áp — Agreeableness] Giọng tình cảm như người quen, tạo kết nối cá nhân',
    'dong-cam':     '[Đồng cảm — Agreeableness] Hiểu cảm xúc khách, đặt mình vào vị trí khách trước khi reply',
    'thang-than':   '[Thẳng thắn — Agreeableness-low] Nói rõ được/không được, không vòng vo, không làm hài lòng giả tạo',
    // Service-specific
    'chuyen-nghiep':'[Chuyên nghiệp — Service] Formal, đúng mực, thể hiện shop có quy trình rõ ràng',
    'than-thien':   '[Thân thiện — Service] Balance giữa formal và casual, universal-safe tone cho mọi khách',
    'tinh-te':      '[Tinh tế — Service] Để ý nuance ngôn ngữ, xử lý khéo tình huống nhạy cảm, vocabulary chọn lọc',
  };

  const voice = voiceMap[mix.voice] || voiceMap['em-nu-tre'];
  const customerAddr = customerMap[mix.customer] || customerMap['anh-chi'];
  const traits = Array.isArray(mix.traits) ? mix.traits : [];
  const formality = Math.max(1, Math.min(10, parseInt(mix.formality, 10) || 5));
  const formalityDesc = formality >= 8 ? 'Rất trang trọng (10 = lễ tân khách sạn 5 sao)'
    : formality >= 6 ? 'Trang trọng vừa phải (giống nhân viên văn phòng)'
    : formality >= 4 ? 'Balance — thân thiện nhưng vẫn lịch sự (chuẩn CSKH phổ biến)'
    : 'Thân mật — giống bạn bè, không formal';

  const traitList = traits.map(t => `- ${traitMap[t] || t}`).join('\n') || '- (CEO chưa chọn trait cụ thể — dùng style mặc định)';
  const customGreeting = (mix.greeting || '').trim();
  const customClosing = (mix.closing || '').trim();
  const customPhrases = (mix.phrases || '').trim().split('\n').map(s => s.trim()).filter(Boolean);

  return `# Persona Mix — Tính cách bot hiện tại

> File này được compile tự động từ config CEO đã chọn ở wizard/settings. KHÔNG sửa tay.
> Sửa qua Dashboard → Cài đặt → Tính cách nhân viên.

## Xưng hô + giới tính bot
- Bot tự xưng: **${voice.pronoun}**
- Giới tính archetype: ${voice.gender}
- ${customerAddr}

## Tính cách đặc trưng (${traits.length}/5 đặc điểm đã chọn)
${traitList}

## Độ trang trọng: ${formality}/10
${formalityDesc}

${customGreeting ? `## Câu chào riêng (CEO tự đặt)
"${customGreeting}"

Bot PHẢI dùng câu này cho lần đầu chào khách trong phiên.

` : ''}${customClosing ? `## Câu kết riêng (CEO tự đặt)
"${customClosing}"

Bot PHẢI dùng câu này khi kết thúc conversation.

` : ''}${customPhrases.length > 0 ? `## Cụm từ đặc trưng (CEO tự đặt)
${customPhrases.map(p => `- "${p}"`).join('\n')}

Bot nên dùng các cụm này tự nhiên trong reply (không ép).

` : ''}## Hướng dẫn áp dụng cho bot

1. **Giọng văn**: Kết hợp tính cách + xưng hô thành reply tự nhiên. VD:
   - Ấm áp + Em nữ trẻ → "Dạ em chào anh/chị ạ, anh/chị cần em tư vấn gì không ạ?"
   - Chuyên nghiệp + Em nam trẻ → "Dạ em chào anh/chị. Anh/chị đang cần tư vấn về sản phẩm nào ạ?"

2. **Kết hợp trait, không isolated**: Nếu có trait "Thẳng thắn" + "Chu đáo" → vừa nói rõ cái được/không được, vừa gợi ý alternative. Đừng chỉ thẳng thắn mà thiếu chu đáo.

3. **Đừng lặp cùng 1 signature phrase mỗi reply**: Dùng luân phiên, tự nhiên.

4. **Tất cả rule defense (prompt injection, PII, scope, Dạ/ạ chuẩn CSKH) trong AGENTS.md vẫn BẮT BUỘC** — persona mix KHÔNG override defense rules, chỉ override giọng nói.

5. **Độ dài reply**: Theo SOUL.md — tối đa 3 câu, dưới 80 từ trên Zalo. Persona KHÔNG extend giới hạn này.
`;
}

// --- syncPersonaToBootstrap() ---
// Reads active-persona.json, compiles it, injects into SOUL.md between markers.
function syncPersonaToBootstrap() {
  try {
    const ws = getWorkspace();
    if (!ws) return;
    const personaJsonPath = path.join(ws, 'active-persona.json');
    if (!fs.existsSync(personaJsonPath)) return;
    const mix = JSON.parse(fs.readFileSync(personaJsonPath, 'utf-8'));
    const compiled = compilePersonaMix(mix);
    const soulPath = path.join(ws, 'SOUL.md');
    if (!fs.existsSync(soulPath)) return;
    let soul = fs.readFileSync(soulPath, 'utf-8');
    const startIdx = soul.indexOf(_PERSONA_MARKER_START);
    const endIdx = soul.indexOf(_PERSONA_MARKER_END);
    const injection = `${_PERSONA_MARKER_START}\n${compiled}\n${_PERSONA_MARKER_END}`;
    if (startIdx >= 0 && endIdx >= 0) {
      soul = soul.slice(0, startIdx) + injection + soul.slice(endIdx + _PERSONA_MARKER_END.length);
    } else {
      soul = soul.trimEnd() + '\n\n---\n\n' + injection + '\n';
    }
    fs.writeFileSync(soulPath, soul, 'utf-8');
    console.log('[bootstrap-sync] persona injected into SOUL.md');
  } catch (e) {
    console.warn('[bootstrap-sync] persona sync failed:', e?.message);
  }
}

// --- syncShopStateToBootstrap() ---
// Reads shop-state.json, injects summary into USER.md between markers.
function syncShopStateToBootstrap() {
  try {
    const ws = getWorkspace();
    if (!ws) return;
    const statePath = path.join(ws, 'shop-state.json');
    if (!fs.existsSync(statePath)) return;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const parts = [];
    if (state.outOfStock) parts.push('- Hết hàng: ' + state.outOfStock);
    if (state.staffAbsent) parts.push('- Nhân viên vắng: ' + state.staffAbsent);
    if (state.shippingDelay) parts.push('- Giao hàng chậm: ' + state.shippingDelay);
    if (state.activePromotions) parts.push('- Khuyến mãi: ' + state.activePromotions);
    if (state.earlyClosing) parts.push('- Đóng cửa sớm: ' + state.earlyClosing);
    if (state.specialNotes) parts.push('- Ghi chú: ' + state.specialNotes);
    if (parts.length === 0) return; // nothing to inject
    const body = `## Tình trạng hôm nay (CEO cập nhật ${state.updatedAt ? new Date(state.updatedAt).toLocaleString('vi-VN') : 'gần đây'})\n\n` +
      'Bot PHẢI tham khảo thông tin này khi trả lời khách. Đây là tình trạng THỰC TẾ hôm nay.\n\n' +
      parts.join('\n') + '\n';
    const userPath = path.join(ws, 'USER.md');
    if (!fs.existsSync(userPath)) return;
    let user = fs.readFileSync(userPath, 'utf-8');
    const startIdx = user.indexOf(_SHOPSTATE_MARKER_START);
    const endIdx = user.indexOf(_SHOPSTATE_MARKER_END);
    const injection = `${_SHOPSTATE_MARKER_START}\n${body}\n${_SHOPSTATE_MARKER_END}`;
    if (startIdx >= 0 && endIdx >= 0) {
      user = user.slice(0, startIdx) + injection + user.slice(endIdx + _SHOPSTATE_MARKER_END.length);
    } else {
      user = user.trimEnd() + '\n\n---\n\n' + injection + '\n';
    }
    fs.writeFileSync(userPath, user, 'utf-8');
    console.log('[bootstrap-sync] shop-state injected into USER.md (' + parts.length + ' fields)');
  } catch (e) {
    console.warn('[bootstrap-sync] shop-state sync failed:', e?.message);
  }
}

// --- syncAllBootstrapData() ---
function syncAllBootstrapData() {
  syncPersonaToBootstrap();
  syncShopStateToBootstrap();
}

// --- syncProfileToUserMd(profile) ---
// Injects the CEO/assistant personalization profile (name, honorific/xưng hô, bot
// name, company) into USER.md between markers — so USER.md holds the COMPLETE
// personalization the bot reads each message. Merges with any existing values so a
// partial update (e.g. a persona-only edit) doesn't wipe fields set by the wizard.
function syncProfileToUserMd(profile = {}) {
  try {
    const ws = getWorkspace();
    if (!ws) return;
    const userPath = path.join(ws, 'USER.md');
    if (!fs.existsSync(userPath)) return;
    let user = fs.readFileSync(userPath, 'utf-8');
    const startIdx = user.indexOf(_PROFILE_MARKER_START);
    const endIdx = user.indexOf(_PROFILE_MARKER_END);
    const hasValid = startIdx >= 0 && endIdx > startIdx;
    const prev = {};
    if (hasValid) {
      const block = user.slice(startIdx, endIdx);
      const grab = (re) => { const m = block.match(re); return m ? m[1].trim() : ''; };
      prev.ceoName = grab(/Tên chủ doanh nghiệp:\s*(.*)/);
      prev.ceoTitle = grab(/Trợ lý gọi chủ là:\s*(.*)/);
      prev.company = grab(/Tên công ty\/cửa hàng:\s*(.*)/);
      prev.botName = grab(/Tên trợ lý:\s*(.*)/);
    }
    const clean = (v) => String(v == null ? '' : v).replace(/<!--|-->/g, '').replace(/[\r\n]/g, ' ').trim();
    const keep = (v) => (v && v !== '(chưa có)' && v !== 'em (mặc định)') ? v : '';
    const ceoName = clean(profile.ceoName) || keep(prev.ceoName);
    const ceoTitle = clean(profile.ceoTitle) || keep(prev.ceoTitle);
    const company = clean(profile.company) || keep(prev.company);
    const botName = clean(profile.botName) || keep(prev.botName);
    const body = '## Hồ sơ chủ doanh nghiệp + Trợ lý (CEO thiết lập)\n\n' +
      'Bot dùng thông tin này để xưng hô và giới thiệu đúng. Đây là thông tin chính thức.\n\n' +
      '- Tên chủ doanh nghiệp: ' + (ceoName || '(chưa có)') + '\n' +
      '- Trợ lý gọi chủ là: ' + (ceoTitle || '(chưa có)') + '\n' +
      '- Tên công ty/cửa hàng: ' + (company || '(chưa có)') + '\n' +
      '- Tên trợ lý: ' + (botName || 'em (mặc định)') + '\n';
    const injection = `${_PROFILE_MARKER_START}\n${body}\n${_PROFILE_MARKER_END}`;
    if (hasValid) {
      user = user.slice(0, startIdx) + injection + user.slice(endIdx + _PROFILE_MARKER_END.length);
    } else if (startIdx >= 0) {
      // Corrupt/partial section (orphan start marker, e.g. a crash mid-write) —
      // strip from the orphan onward, then re-append one clean section (no dup).
      user = user.slice(0, startIdx).trimEnd() + '\n\n' + injection + '\n';
    } else {
      user = user.trimEnd() + '\n\n---\n\n' + injection + '\n';
    }
    fs.writeFileSync(userPath, user, 'utf-8');
    console.log('[bootstrap-sync] personalization profile injected into USER.md');
  } catch (e) {
    console.warn('[bootstrap-sync] profile sync failed:', e?.message);
  }
}

module.exports = {
  compilePersonaMix,
  syncPersonaToBootstrap,
  syncShopStateToBootstrap,
  syncProfileToUserMd,
  syncAllBootstrapData,
};
