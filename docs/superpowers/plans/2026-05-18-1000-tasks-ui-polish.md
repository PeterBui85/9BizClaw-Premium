# UI Polish — 250 Micro Tasks
Each task is 1-3 minutes, CSS/HTML only, zero breaking risk.

## Spacing (tasks 1-25)

1. `.ov-hero` (dashboard L1003) — padding is `24px 28px`, inconsistent with `.ov-card` at `20px`; normalize to `24px` on both
2. `.ov-stats` (dashboard L1049) — gap `14px` while `.ov-grid` uses `16px`; normalize gap to `16px`
3. `.ov-card-head` (dashboard L1094) — margin-bottom `14px` while `.main-card h3` uses `18px`; normalize to `16px`
4. `.activity-item` (dashboard L1443) — padding `14px 0` vertically but `.ov-row` uses `10px 4px`; normalize vertical rhythm
5. `.rail-header` (dashboard L44) — padding `14px 0 12px` asymmetric top/bottom; normalize to `14px 0`
6. `.rail-item` (dashboard L53) — padding `12px 4px 10px` asymmetric; normalize to `12px 4px`
7. `.rail-bottom` (dashboard L64) — padding `12px 0 10px` asymmetric; normalize to `12px 0`
8. `.content-tabs` (dashboard L73) — padding `0 36px` while `.main-content` uses `36px 48px`; align left padding to `48px`
9. `.know-col` (dashboard L588) — padding `14px` while `.tg-sidebar` also uses `14px` but `.zalo-sidebar` uses `16px`; normalize all to `16px`
10. `.know-file` (dashboard L605) — padding `12px` while `.know-folder` uses `14px`; normalize to `14px`
11. `.zalo-mgr-box` (dashboard L482) — padding `20px` while `.modal-box` uses `24px`; normalize to `24px`
12. `.zum-header` (dashboard L447) — padding `18px 20px 14px` asymmetric top/bottom; normalize to `18px 20px`
13. `.zum-footer` (dashboard L449) — padding `14px 20px 18px` asymmetric; normalize to `16px 20px`
14. `.zum-body` (dashboard L448) — padding `18px 22px` while header/footer use `20px` horizontal; normalize to `18px 20px`
15. `.chat-messages` (dashboard L666) — padding `20px 24px` while `.chat-input-bar` uses `12px 24px 8px`; normalize bottom to `12px 24px`
16. `.chat-top-bar` (dashboard L658) — padding `10px 24px` shorter than `.chat-input-bar` `12px 24px`; normalize to `12px 24px`
17. `.wz-progress` (wizard L128) — padding `32px 64px 0` while `.wz-form-scroll` uses `48px 64px 32px`; uneven top gap between progress and form
18. `.wz-footer` (wizard L422) — padding `24px 64px 32px` bottom-heavy; normalize to `24px 64px`
19. `.wz-field-row` (wizard L191) — gap `20px` while `.wz-grid` uses `12px`; wide gap between field columns feels off
20. `.wz-instruction` (wizard L435) — padding `20px 24px` while `.wz-tg-part` uses `24px 28px`; normalize to `24px`
21. `.wz-instruction-body` (wizard L466) — padding-left `40px` while `.wz-tg-substep-action` uses margin-left `42px`; normalize to `40px`
22. `.tg-layout` (dashboard L548) — gap `12px` while `.zalo-layout` uses `16px`; normalize to `16px`
23. `.cron-detail-box` (dashboard L474) — padding `24px` matches `.modal-box` but `.cron-detail-row` padding `8px 0` feels tight; increase to `10px 0`
24. `.gw-step` (dashboard L156) — padding `14px 16px` while `.gw-guide-hero` uses `18px 20px`; normalize to `16px 18px`
25. `.page-header` (dashboard L965) — gap `18px` and margin-bottom `32px`, but embedded page `.embed-wrap` has no top margin; add `margin-top:8px` to `.embed-wrap`

## Border Radius (tasks 26-42)

26. `.modal-box` (dashboard L467) — base radius `16px`, premium override `18px`; pick one, use `16px` consistently
27. `.cron-detail-box` (dashboard L474) — base `16px`, override `18px`; normalize to `16px`
28. `.zalo-mgr-box` (dashboard L482) — base `16px`, override `18px`; normalize to `16px`
29. `.card` (dashboard L114) — radius `10px` while `.main-card` has `12px` base then `14px` override then `10px` neutral override; settle on `12px`
30. `.ov-hero` (dashboard L1006) — radius `16px` while `.ov-card` uses `14px`; normalize to `14px`
31. `.ov-stat` (dashboard L1058) — radius `14px`, normalized to `10px` by neutral theme; settle on `12px`
32. `.channel-status` (dashboard L103) — radius `12px` base, overridden to `999px` pill; remove base definition
33. `.zc-select` (dashboard L515) — radius `6px` while nearby `.zc-summary-btn` uses `6px` but `.zs-select` uses `7px`; normalize to `8px`
34. `.know-drop-zone` (dashboard L626) — radius `12px`, consistent; but `.know-upload-help` uses `8px`; normalize to `10px`
35. `.gw-api-btn` (dashboard L174) — radius `8px`, fine; but `.gw-check-box` uses `10px`; normalize `.gw-api-btn` to `10px`
36. `.tg-chip` (#page-telegram, dashboard L2673) — radius `14px` (half of 28px height); change to `999px` for true pill shape
37. `.chat-bubble-user` (dashboard L688) — radius `18px 18px 4px 18px`, good; but `.chat-typing-body` uses `12px`; normalize `.chat-typing-body` to `16px`
38. `.chat-action` (dashboard L691) — radius `6px` while `.chat-action-card` uses `10px`; normalize to `8px`
39. `.wz-qr-frame` (wizard L756) — radius `16px`, consistent with modal style
40. `.wz-choice-icon` (wizard L293) — radius `10px` while `.wz-instruction-num` uses `50%` (circle); fine as-is, but `.wz-badge` uses `999px` — normalize badge and chip radius
41. `.pd-step` (wizard L924) — radius `14px`, fine; but `.pd-header .pd-num` uses `50%` correctly
42. `.guide-tooltip` (dashboard L2410) — radius `12px`; but `.guide-card` uses `8px`; normalize `.guide-card` to `10px`

## Font Sizes (tasks 43-62)

43. `.ov-card-head h3` (dashboard L1100) — `11px` uppercase; but `.main-card h3` base was `14px` before override to `11px`; ensure both always resolve to `11px`
44. `.activity-header h3` (dashboard L1436) — `11px` matches `.ov-card-head h3`; good, but `.zalo-section h4` uses `14px`; normalize section headers to `13px`
45. `.rail-label` (dashboard L58) — `10px`; too small for readability; increase to `11px`
46. `.rail-version` (dashboard L69) — `10px`; increase to `11px` to match `.rail-label`
47. `.page-header h2` (dashboard L986) — `28px`; but `.ov-hero-greeting` uses `22px`; the hero greeting should match page headers at `24px` minimum
48. `.page-header .page-sub` (dashboard L994) — `14px` override; but `.zalo-col-help` uses `11px` for similar helper text; normalize helper text to `12px`
49. `.tl-time` (dashboard L2631) — `18px` font-weight 700; heavy for a time display; reduce to `16px`
50. `.tl-type` (dashboard L2639) — `9px` uppercase badge; too small; increase to `10px`
51. `.tl-meta` (dashboard L2645) — `10.5px`; normalize to `11px` (avoid half-pixel sizes)
52. `.gw-sheet-row-meta` (dashboard L284) — `10.5px`; normalize to `11px`
53. `.zc .zc-meta` (dashboard L503) — `11.5px`; normalize to `12px` (avoid half-pixel)
54. `.gw-step p` (dashboard L170) — `12.5px`; normalize to `13px`
55. `.gw-step ul` (dashboard L171) — `12.5px`; normalize to `13px`
56. `.schedule-hint` (dashboard L399) — `12.5px`; normalize to `13px`
57. `.know-empty-guide-sub` (dashboard L387) — `12.5px`; normalize to `13px`
58. `.gw-warning-note` (dashboard L207) — `12.5px`; normalize to `13px`
59. `.wz-step h2` (wizard L173) — `32px`; but `.test-headline` uses `22px` for same-level headings; normalize `.test-headline` to `28px`
60. `.wz-cs-item strong` (wizard L558) — `13px`; fine, but `.wz-cs-item p` uses `12px` creating tight hierarchy; increase description to `12.5px` or keep
61. `.chat-content h2` (dashboard L676) — `15px`, `.chat-content h3` is `14px` — only 1px difference; increase h2 to `16px`
62. `.chat-input-hint` (dashboard L727) — `10px` opacity `.5`; too faint; increase to `11px` opacity `.6`

## Colors/Opacity (tasks 63-82)

63. `.support-fab` (dashboard L408) — hardcoded `#4ea1ff` in `background:var(--accent, #4ea1ff)`; remove fallback since `--accent` is always defined
64. `.know-folder.active` (dashboard L592) — hardcoded `#4ea1ff` fallback on `var(--accent, #4ea1ff)`; remove fallback
65. `.know-folder .icon-wrap` (dashboard L593) — hardcoded `#4ea1ff`; use `var(--accent)`
66. `.know-empty .big-icon` (dashboard L625) — hardcoded `#4ea1ff`; use `var(--accent)`
67. `.know-drop-zone:hover` (dashboard L627) — hardcoded `#4ea1ff`; use `var(--accent)`
68. `.schedule-icon-wrap` (dashboard L532) — hardcoded `#4ea1ff`; use `var(--accent)`
69. `.zc-state-off` (dashboard L511) — opacity `0.6` on entire card; too dim, hard to read; increase to `0.7`
70. `.zc-state-off:hover` (dashboard L512) — opacity `0.85` on hover; increase to `0.9`
71. `.chat-time` (dashboard L694) — opacity `0.4` at rest; too invisible; increase to `0.5`
72. `.tl-meta` (dashboard L2645) — opacity `0.7`; remove explicit opacity, rely on `var(--text-muted)` color
73. `.vis-badge.vis-public` (dashboard L614) — hardcoded `#e5e5e5` background, `#555` text; use CSS vars `var(--border)` and `var(--text-muted)`
74. `.vis-badge.vis-internal` (dashboard L615) — hardcoded `#fff3cd` / `#856404`; use `rgba(var(--warning), 0.15)` pattern with var
75. `.vis-badge.vis-private` (dashboard L616) — hardcoded `#f8d7da` / `#721c24`; use danger color vars
76. `.guide-tooltip` (dashboard L2410) — hardcoded `#18181b` background; should use `var(--surface)` for theme consistency
77. `.guide-card` (dashboard L2444) — hardcoded `#111113`; use `var(--bg)`
78. `.guide-note` (dashboard L2452) — hardcoded `#1c1c1e` bg, `#3a3a3c` border; use `var(--surface)` and `var(--border)`
79. `.guide-btn-primary` (dashboard L2465) — hardcoded `#f5f5f5` bg, `#18181b` text; use `var(--text)` bg and `var(--bg)` text for theme adaptivity
80. `.tg-sim-hdr` (wizard L1005) — hardcoded `#1f2936`; has light override but no var usage; consider `var(--surface)`
81. `.wz-cs-title` (wizard L505) — hardcoded `#0f172a` in `var(--wz-text, #0f172a)`; define `--wz-text` in both themes
82. `.wz-cs-sub` (wizard L510) — hardcoded `#64748b` in `var(--wz-muted, #64748b)`; define `--wz-muted` in both themes

## Hover States (tasks 83-102)

83. `.ov-card-action` (dashboard L1107) — has hover; but `.page-help-btn` (L1402) has different hover pattern; normalize both to use `var(--accent)` border on hover
84. `.zalo-mgr-tab` (dashboard L485) — no hover background; add `background:var(--surface-hover)` on hover
85. `.content-tab` (dashboard L74) — hover changes color only; add subtle `background:var(--surface-hover)` on hover
86. `.gw-tab` (dashboard L223) — base has no hover background; premium adds `background:var(--surface-hover)`; ensure base also has it
87. `.zalo-tab-btn` (dashboard L563) — hover changes color only; add `background:var(--surface-hover)` on hover
88. `.know-file-delete` (dashboard L622) — hover shows red; missing `transition:all 0.15s`; add it
89. `.group-memory-close` (dashboard L523) — hover changes color only; add `background:var(--surface-hover)` and `border-radius:6px`
90. `.support-menu-item` (dashboard L425) — transition `0.1s`; normalize to `0.15s` to match rest of UI
91. `.chat-suggestion-chip` (dashboard L698) — good hover; but no `:active` state; add `transform:scale(0.97)` on active
92. `.chat-prompt-card` (dashboard L738) — hover changes border; add `transform:translateY(-1px)` for depth
93. `.prompt-row` (dashboard L745) — hover background `var(--bg)`; add `border-radius:8px` to match
94. `.tl-row` (dashboard L2629) — hover has background; missing `transition:background 0.15s`; add `0.15s` (currently `0.12s`); normalize to `0.15s`
95. `.skill-list-item` (dashboard L786) — has hover; but active state uses `var(--accent)` background with `#fff` text — verify light theme legibility
96. `.wz-choice` (wizard L277) — hover `transform:translateY(-1px)` good; but missing focus-visible outline
97. `.wz-cs-item` (wizard L522) — hover changes border; add `transform:translateY(-1px)` for premium feel
98. `.benefit-row` (wizard L895) — no hover state; add `background:var(--surface-hover)` + `border-radius:10px` + `margin:0 -8px; padding-left:8px; padding-right:8px`
99. `.pd-step` (wizard L924) — no hover state on non-active steps; add `border-color:var(--border-strong)` on hover for unlocked steps
100. `.checklist-item` (wizard L1184) — hover not styled; add `background:var(--surface-hover); border-radius:8px; padding:10px 8px; margin:0 -8px`
101. `.ov-mem-row` (dashboard L1152) — no hover; add `background:var(--surface-hover); border-radius:8px; margin:0 -4px; padding:10px 8px` on hover
102. `.ov-schedule-row` (dashboard L1215) — no hover; add `background:var(--surface-hover); border-radius:8px` on hover

## Focus States (tasks 103-118)

103. `.btn` (dashboard L1366) — no `:focus-visible` outline; add `outline:2px solid var(--accent); outline-offset:2px`
104. `.btn-primary` (dashboard L1372) — no `:focus-visible`; add `outline:2px solid var(--accent); outline-offset:2px`
105. `.btn-secondary` (dashboard L1377) — no `:focus-visible`; add `outline:2px solid var(--accent); outline-offset:2px`
106. `.rail-item` (dashboard L53) — no focus-visible; add `outline:2px solid var(--accent); outline-offset:-2px` for keyboard nav
107. `.content-tab` (dashboard L74) — no focus-visible; add `outline:2px solid var(--accent); outline-offset:-2px`
108. `.toggle-switch input:focus-visible + .toggle-slider` (dashboard L131) — no focus ring; add `box-shadow:0 0 0 3px var(--accent-soft)`
109. `.zs-select:focus-visible` (dashboard L560) — only has `border-color`; add `box-shadow:0 0 0 3px var(--accent-soft)`
110. `.chat-send-btn:focus-visible` (dashboard L723) — no focus ring; add `outline:2px solid var(--accent); outline-offset:2px`
111. `.chat-attach-btn:focus-visible` (dashboard L720) — no focus ring; add `outline:2px solid var(--accent); outline-offset:2px`
112. `.know-folder:focus-visible` (dashboard L590) — no focus ring; add `outline:2px solid var(--accent); outline-offset:2px`
113. `.support-fab:focus-visible` (dashboard L408) — no focus ring; add `outline:2px solid #fff; outline-offset:2px`
114. `.wz-btn:focus-visible` (wizard L355) — no focus-visible; add `outline:2px solid var(--accent); outline-offset:2px`
115. `.wz-btn-ghost:focus-visible` (wizard L384) — no focus ring; add `outline:2px solid var(--accent); outline-offset:2px`
116. `.wz-btn-confirm:focus-visible` (wizard L914) — no focus ring; add `outline:2px solid var(--accent); outline-offset:2px`
117. `.wz-choice:focus-within` (wizard L277) — no focus ring when inner input focused; add `outline:2px solid var(--accent); outline-offset:2px`
118. `.persona-chip:focus-visible` (#page-persona-mix, dashboard L1961) — no focus ring; add `outline:2px solid var(--accent); outline-offset:2px`

## Dark/Light Consistency (tasks 119-138)

119. `.telegram-pause-banner` (dashboard L2769) — hardcoded `#2a2017` bg, `#5c4a1e` border, `#e8c66a` text; breaks in light theme; use `rgba(var(--warning-rgb),0.08)` pattern
120. `.zalo-pause-banner` (dashboard L2975) — same hardcoded dark colors as telegram pause banner; same fix needed
121. `.guide-tooltip` (dashboard L2410) — entirely hardcoded dark palette; unusable in light theme; wrap in `[data-theme="light"]` override
122. `.guide-progress-seg` (dashboard L2433) — hardcoded `#27272a`; use `var(--border)`
123. `.guide-progress-seg.done` (dashboard L2437) — hardcoded `#a1a1aa`; use `var(--text-muted)`
124. `.guide-step-label` (dashboard L2438) — hardcoded `#71717a`; use `var(--text-tertiary)`
125. `.guide-title` (dashboard L2442) — hardcoded `#f5f5f5`; use `var(--text)`
126. `.guide-text` (dashboard L2443) — hardcoded `#a1a1aa`; use `var(--text-muted)`
127. `.guide-card-title` (dashboard L2450) — hardcoded `#f5f5f5`; use `var(--text)`
128. `.guide-card-desc` (dashboard L2451) — hardcoded `#a1a1aa`; use `var(--text-muted)`
129. `.guide-spotlight` (dashboard L2403) — hardcoded `#52525b` border; use `var(--border-strong)`
130. `.guide-btn-back` (dashboard L2467) — hardcoded `#3a3a3c` border, `#71717a` text; use `var(--border)` and `var(--text-muted)`
131. `.guide-skip` (dashboard L2472) — hardcoded `#71717a`; use `var(--text-tertiary)`
132. `.guide-skip:hover` (dashboard L2476) — hardcoded `#a1a1aa`; use `var(--text-muted)`
133. `.premium-entrance-kicker` (dashboard L1828) — hardcoded `rgba(232,211,157,.78)`; OK for entrance animation, skip
134. `.ov-mem-badge` (dashboard L1160) — `var(--surface-2, #f0f0f0)` fallback not themed; define `--surface-2` or use `var(--surface-hover)`
135. `.ov-mem-del` (dashboard L1179) — `var(--text-3, #aaa)` undefined; use `var(--text-muted)`
136. `.ov-mem-badge` (dashboard L1162) — `var(--text-2, #888)` undefined; use `var(--text-muted)`
137. `.zalo-mgr-tab.active` (dashboard L486) — `var(--accent, #4ea1ff)` fallback is blue, but accent is now gold; remove fallback
138. `.zum-footer textarea:focus` (dashboard L451) — `var(--accent, #4a9eff)` blue fallback; remove

## Transitions (tasks 139-155)

139. `.ov-stat` (dashboard L1060) — transition `border-color 0.2s ease`; normalize to `0.15s` matching global motion
140. `.ov-card` (dashboard L1091) — transition `border-color 0.2s ease`; normalize to `0.15s`
141. `.main-card` (dashboard L1274) — transition `border-color 0.2s ease`; normalize to `0.15s`
142. `.wz-input` (wizard L223) — transition `all 0.2s ease`; normalize to `all 0.15s ease`
143. `.wz-choice` (wizard L285) — transition `all 0.2s ease`; normalize to `all 0.15s ease`
144. `.wz-btn` (wizard L367) — transition `all 0.2s ease`; normalize to `all 0.15s ease`
145. `.wz-cs-item` (wizard L530) — transition `border-color 0.15s ease, box-shadow 0.15s ease`; good, consistent
146. `.pd-step` (wizard L926) — transition `border-color 0.3s, opacity 0.3s`; too slow; normalize to `0.2s`
147. `.chat-input-wrap` (dashboard L718) — transition `border-color .2s`; normalize to `.15s`
148. `.tg-sim-input-field` (wizard L1076) — no transition on color/background; not needed (static)
149. `.support-menu-item` (dashboard L428) — transition `background 0.1s`; normalize to `0.15s`
150. `.zalo-radio-row` (dashboard L915) — transition `border-color 0.15s, background 0.15s`; consistent
151. `.activity-drawer` (dashboard L535) — transition `right 0.25s ease`; fine for slide-in panel
152. `.tl-row` (dashboard L2629) — transition `background .12s`; normalize to `.15s`
153. `.wz-btn-confirm` (wizard L917) — transition `all 0.2s`; normalize to `all 0.15s`
154. `.tg-start-pill` (wizard L1088) — transition `all 0.2s`; normalize to `all 0.15s`
155. `.wz-tg-bubble` (wizard L659) — no transition; add `transition:background 0.15s` for theme switch smoothness

## Responsive (tasks 156-172)

156. `.wz-shell` (wizard L16) — `minmax(380px, 38%)` left panel; at 1024px this collapses; but between 1025-1100px the right panel is cramped; add intermediate breakpoint at `1100px` to reduce left panel to `320px`
157. `.know-columns` (dashboard L587) — 3-column `260px 1fr 320px`; at 1200px breakpoint collapses to 1fr; add intermediate 2-column layout at `1400px` for medium screens
158. `.appt-grid` (#page-calendar, dashboard L2073) — `minmax(300px,1fr) minmax(400px,1.3fr)`; at 1100px collapses; but between 1024-1100px content overflows; lower breakpoint to `1024px`
159. `.gw-api-grid` (dashboard L173) — 5-column grid; at `1100px` drops to 2; at 1024px still cramped; add `@media (max-width:600px)` for single column
160. `.ov-hero` (dashboard L1003) — flex row; on narrow screens text + status overlap; add `flex-wrap:wrap` and `gap:12px`
161. `.page-header` (dashboard L965) — buttons stack poorly at 1024px; add `flex-wrap:wrap` to page header action containers
162. `.tg-capabilities` (#page-telegram, dashboard L2672) — `flex-wrap:wrap`; good; but chips overflow parent at `<900px`; add `max-width:100%` on container
163. `.chat-prompt-grid` (dashboard L737) — 2-column grid; at narrow widths cards cramp; add `@media (max-width:500px) { grid-template-columns:1fr }`
164. `.premium-entrance-brand` (dashboard L1835) — `clamp(34px, 6vw, 74px)` font; at 720px switches to column; good responsive handling
165. `.skills-layout` (dashboard L778) — `height:calc(100vh - 140px)`; at 900px the left panel `280px` dominates; add `@media (max-width:900px) { flex-direction:column; .skills-list-panel { width:100%; height:200px } }`
166. `.tg-cmd-row .tg-cmd-cat` (#page-telegram, dashboard L2692) — `width:72px` fixed; at narrow widths wastes space; hide at `<900px` breakpoint
167. `.wz-field-row` (wizard L191) — 2-column grid; at narrow wizard panel the fields cramp; add `@media (max-width:640px) { grid-template-columns:1fr }`
168. `.gw-calendar-shell .fc .fc-toolbar-title` (dashboard L242) — `22px` font; responsive to `18px` at 900px; good
169. `.zalo-layout` (dashboard L555) — `260px minmax(0,1fr)` grid; `900px` breakpoint to 1fr; good
170. `.dual-cta` (wizard L913) — `flex-wrap:wrap`; good; but `.cta-or` disappears on wrap — add `width:100%; text-align:center` when wrapped
171. `.main-content` (dashboard L958) — responsive padding `28px 32px` at 1280px, `24px 28px` at 1024px; add `20px 16px` at `<800px`
172. `.ov-grid` (dashboard L1078) — 2-column grid; collapses at 980px; good breakpoint

## Scrollbar Styling (tasks 173-185)

173. `.zalo-sidebar` (dashboard L556) — has `overflow-y:auto` but no custom scrollbar; add matching `::-webkit-scrollbar` styles
174. `.tg-sidebar` (dashboard L549) — has `overflow-y:auto` but no custom scrollbar; add matching styles
175. `.tg-main` (dashboard L550) — `overflow-y:auto` without custom scrollbar; add styles
176. `.zum-body` (dashboard L448) — `overflow-y:auto` without custom scrollbar; add styles
177. `.zalo-mgr-pane` (dashboard L487) — `overflow-y:auto` without custom scrollbar; add styles
178. `.cron-detail-prompt` (dashboard L480) — `max-height:120px; overflow-y:auto` without custom scrollbar; add styles
179. `.skill-detail-content` (dashboard L801) — `max-height:60vh; overflow-y:auto` without custom scrollbar; add styles
180. `.skills-list-panel` (dashboard L779) — `overflow-y:auto; padding:12px 0` without custom scrollbar; add styles
181. `.skills-detail-panel` (dashboard L780) — `overflow-y:auto` implied by content; add scrollbar styles
182. `.group-memory-content` (dashboard L520) — `overflow-y:auto` without custom scrollbar; add styles
183. `.gw-result` (dashboard L229) — `overflow:auto; max-height:560px` without custom scrollbar; add styles
184. `.gw-sheet-list` (dashboard L280) — `max-height:180px; overflow:auto` without custom scrollbar; add styles
185. `.gw-tabs` (dashboard L222) — `overflow-x:auto` with `scrollbar-width:thin` for Firefox; add `::-webkit-scrollbar` for Chromium/Electron

## Icon Sizing (tasks 186-198)

186. `.rail-item .rail-icon` (dashboard L56) — `24px` square; but `.rail-logo` is `44px`; the 24px icons feel small relative to logo; increase to `26px`
187. `.channel-icon` (dashboard L101) — base `18px` font; premium override `36px` container; inconsistent jump
188. `.page-header .page-icon` (dashboard L973) — `48px` container; inner icon `26px` via `data-icon-size`; good proportion
189. `.know-folder .icon-wrap` (dashboard L593) — `36px` container; inner icon unspecified; ensure `data-icon-size="20"` on all folder icons
190. `.know-file .file-icon` (dashboard L607) — `40px` container; larger than folder icons at `36px`; normalize to `36px`
191. `.benefit-icon` (wizard L897) — `44px` container; inner SVG `22px`; good 2:1 ratio
192. `.wz-instruction-num` (wizard L448) — `28px` circle; `.wz-tg-substep-num` is also `28px`; consistent
193. `.wz-cs-icon` (wizard L536) — `32px` container; inner SVG presumed `16px`; good
194. `.chat-avatar` (dashboard L665) — `28px` square; `.chat-empty-avatar` is `56px`; the 28px is tight; increase to `32px`
195. `.tip` (dashboard L338) — `16px` circle with `10px` font; the `?` text can be hard to read; increase circle to `18px`
196. `.chevron-icon` (dashboard L772) — `16px` consistent everywhere; good
197. `.ov-hero-dot` (dashboard L1039) — `8px` dot; `.rail-status-dot` is `11px`; normalize hero dot to `10px`
198. `.ov-schedule-dot` (dashboard L1223) — `12px` diameter; `.tl-dot` in schedule page is `10px`; normalize both to `10px`

## Shadow (tasks 199-212)

199. `.zum-box` (dashboard L446) — `box-shadow:0 24px 64px rgba(0,0,0,0.4)`; should use `var(--shadow-lg)` for theme consistency
200. `.group-memory-content` (dashboard L520) — `box-shadow:0 8px 32px rgba(0,0,0,0.3)`; use `var(--shadow-lg)`
201. `.support-fab` (dashboard L413) — `box-shadow:0 4px 16px rgba(0,0,0,0.2)`; use `var(--shadow)`
202. `.support-menu` (dashboard L422) — `box-shadow:0 8px 32px rgba(0,0,0,0.2)`; use `var(--shadow-lg)`
203. `.activity-drawer` (dashboard L535) — `box-shadow:-8px 0 24px rgba(0,0,0,0.3)`; use `calc(-1 * var(--shadow))` or keep but add light theme variant
204. `.ov-hero` (dashboard L1003) — no box-shadow; add `box-shadow:var(--shadow-sm)` for subtle elevation
205. `.ov-stat` on hover (dashboard L1062) — no shadow change on hover; add `box-shadow:var(--shadow)` on hover
206. `.chat-content pre` (dashboard L677) — no box-shadow; add `box-shadow:var(--shadow-sm)` for code blocks
207. `.wz-tg-bubble` (wizard L659) — no box-shadow; add `box-shadow:0 2px 8px rgba(0,0,0,0.1)` for depth
208. `.wz-summary` (wizard L828) — no box-shadow; add `box-shadow:var(--shadow-sm)` for summary card
209. `.tg-sim` (wizard L976) — `box-shadow:0 8px 32px rgba(0,0,0,0.4)`; has light override at `0.1`; good
210. `.embed-wrap` (dashboard L1510) — `box-shadow:var(--shadow)`; good
211. `.ux-dialog` (dashboard L858) — `box-shadow:0 24px 80px rgba(0,0,0,.34)`; use `var(--shadow-lg)`
212. `.gw-calendar-modal-card` (dashboard L272) — `box-shadow:0 26px 80px rgba(0,0,0,.24)`; use `var(--shadow-lg)`

## Z-index (tasks 213-222)

213. `.modal-overlay` (dashboard L441) — `z-index:100`; but `.support-fab` is `50` and `.support-menu` is `50`; modal correctly above FAB
214. `.group-memory-modal` (dashboard L519) — `z-index:9990`; inconsistent with `.modal-overlay` at `100`; normalize to `100` or create z-index scale
215. `.ux-modal-overlay` (dashboard L857) — `z-index:1300`; much higher than other modals; normalize to consistent range
216. `.guide-overlay` (dashboard L2396) — `z-index:10000`; highest in app; appropriate for product tour
217. `.premium-entrance` (dashboard L1753) — `z-index:10020`; higher than guide; appropriate for entrance animation
218. `.activity-drawer` (dashboard L535) — `z-index:95`; `.activity-drawer-backdrop` is `94`; close to `.support-fab` at `50`; fine
219. `.chat-drop-zone` (dashboard L728) — `z-index:10`; relatively low; fine since it is positioned within chat container
220. `#page-telegram .page-header` (dashboard L892) — `z-index:20`; local stacking for sticky header; fine
221. `[data-tooltip]::after` (dashboard L327) — `z-index:200`; higher than modal at `100`; tooltips inside modals would overlap correctly
222. `.zalo-saving-overlay` (dashboard L889) — `z-index:5`; low, local context; fine

## Text Overflow (tasks 223-237)

223. `.ov-hero-greeting` (dashboard L1015) — no text overflow handling; add `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` for long names
224. `.ov-hero-sub` (dashboard L1022) — no overflow; add `max-width:460px` to prevent ultra-wide lines
225. `.tl-label` (dashboard L2638) — has flex but no overflow handling on main text; add `overflow:hidden; text-overflow:ellipsis` on the text span
226. `.tl-desc` (dashboard L2644) — no overflow handling; add `-webkit-line-clamp:2; display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden`
227. `.ov-schedule-label` (dashboard L1243) — has `text-overflow:ellipsis`; good
228. `.skill-detail-name` (dashboard L795) — no overflow; add `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`
229. `.chat-top-name` (dashboard L660) — no overflow; add `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px`
230. `.appt-card-title` (#page-calendar, dashboard L2154) — has ellipsis; good
231. `.gw-calendar-title` (dashboard L235) — no overflow; add `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`
232. `.media-card-title` (dashboard L879) — has ellipsis; good
233. `.persona-preview-bubble` (#page-persona-mix, dashboard L2031) — no overflow; add `max-height:80px; overflow-y:auto` for long previews
234. `.wz-brand-name` (wizard L66) — no overflow handling; add `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`
235. `.pd-title` (wizard L939) — no overflow; add `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0`
236. `.wz-tg-substep-title` (wizard L638) — no overflow; add `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`
237. `.tg-chip` (#page-telegram, dashboard L2673) — has `white-space:nowrap`; good, but no `max-width`; add `max-width:180px; overflow:hidden; text-overflow:ellipsis`

## Empty States (tasks 238-250)

238. `#page-skills .skill-detail-empty` (dashboard L794) — has placeholder SVG + text; good
239. `#page-skills .skill-list-empty` (dashboard L803) — has text; add a subtle icon (use `data-icon="zap"`) above the text
240. `.know-empty` (dashboard L624) — has `.big-icon` + text; good; but icon `opacity:0.6` too faint; increase to `0.8`
241. `.know-empty-guide` (dashboard L375) — has title + sub; add a subtle SVG icon above title for visual anchor
242. `.zalo-mgr-empty` (dashboard L751) — has text only; add an icon and increase padding
243. `.zum-empty` (dashboard L461) — has icon + title + desc; good comprehensive empty state
244. `.ov-list-empty` (dashboard L1122) — text only `padding:24px 4px`; add icon and increase padding to `32px 16px`
245. `.ov-mem-empty` (dashboard L1195) — text only; add icon above text like `.zum-empty` pattern
246. `.tl-empty` (dashboard L2648) — text only; add calendar icon and increase padding to `48px 20px`
247. `.chat-empty` (dashboard L733) — has avatar + title + sub + prompt grid; excellent empty state
248. `.appt-empty` (#page-calendar, dashboard L2115) — text only, italic; add icon and remove italic (italic feels unfinished)
249. `.gw-calendar-empty` (dashboard L271) — text only with dashed border; add a calendar icon above
250. `.activity-empty` (dashboard L1459) — text only `padding:60px 20px`; add a subtle activity icon above text
