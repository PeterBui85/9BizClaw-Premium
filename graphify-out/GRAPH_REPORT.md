# Graph Report - .  (2026-04-14)

## Corpus Check
- Large corpus: 213 files · ~316,404 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 903 nodes · 1554 edges · 45 communities detected
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 179 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Electron Runtime|Core Electron Runtime]]
- [[_COMMUNITY_Agent Behavior Rules|Agent Behavior Rules]]
- [[_COMMUNITY_Marketing Psychology & CRO|Marketing Psychology & CRO]]
- [[_COMMUNITY_Customer Onboarding System|Customer Onboarding System]]
- [[_COMMUNITY_Marketing Skill Library|Marketing Skill Library]]
- [[_COMMUNITY_Bot Session Lifecycle|Bot Session Lifecycle]]
- [[_COMMUNITY_Board Governance Suite|Board Governance Suite]]
- [[_COMMUNITY_C-Level Advisory Framework|C-Level Advisory Framework]]
- [[_COMMUNITY_Executive Advisory Skills|Executive Advisory Skills]]
- [[_COMMUNITY_Industry Vertical Playbooks|Industry Vertical Playbooks]]
- [[_COMMUNITY_Product User Manual|Product User Manual]]
- [[_COMMUNITY_Sales Playbook & Rules|Sales Playbook & Rules]]
- [[_COMMUNITY_Content & Brand Strategy|Content & Brand Strategy]]
- [[_COMMUNITY_Vendor Build Pipeline|Vendor Build Pipeline]]
- [[_COMMUNITY_Google Calendar Auth|Google Calendar Auth]]
- [[_COMMUNITY_OpenZalo Plugin Patches|OpenZalo Plugin Patches]]
- [[_COMMUNITY_SQLite Binary Fixer|SQLite Binary Fixer]]
- [[_COMMUNITY_Smoke Test Suite|Smoke Test Suite]]
- [[_COMMUNITY_Release & Distribution|Release & Distribution]]
- [[_COMMUNITY_Onboarding UX Design|Onboarding UX Design]]
- [[_COMMUNITY_Core Test Utilities|Core Test Utilities]]
- [[_COMMUNITY_Security Audit Logger|Security Audit Logger]]
- [[_COMMUNITY_Calendar Integration|Calendar Integration]]
- [[_COMMUNITY_Zalo Management Tool|Zalo Management Tool]]
- [[_COMMUNITY_Development Session Log|Development Session Log]]
- [[_COMMUNITY_Calendar Config|Calendar Config]]
- [[_COMMUNITY_Example Tool Template|Example Tool Template]]
- [[_COMMUNITY_Outbound Security Filter|Outbound Security Filter]]
- [[_COMMUNITY_Zalo Safe Send|Zalo Safe Send]]
- [[_COMMUNITY_Memory DB Rebuilder|Memory DB Rebuilder]]
- [[_COMMUNITY_Embed WebUI Design|Embed WebUI Design]]
- [[_COMMUNITY_Security Tool Index|Security Tool Index]]
- [[_COMMUNITY_Mac Build Script|Mac Build Script]]
- [[_COMMUNITY_Memory Write Tool|Memory Write Tool]]
- [[_COMMUNITY_Memory Search Tool|Memory Search Tool]]
- [[_COMMUNITY_Board Communication Hub|Board Communication Hub]]
- [[_COMMUNITY_Tool Index References|Tool Index References]]
- [[_COMMUNITY_Electron Preload Bridge|Electron Preload Bridge]]
- [[_COMMUNITY_Zalo Blocklist Patch|Zalo Blocklist Patch]]
- [[_COMMUNITY_Mac Universal Build|Mac Universal Build]]
- [[_COMMUNITY_Background Remover|Background Remover]]
- [[_COMMUNITY_Knowledge Tab Bootstrap|Knowledge Tab Bootstrap]]
- [[_COMMUNITY_Run Script Reference|Run Script Reference]]
- [[_COMMUNITY_Mac App Nap Fix|Mac App Nap Fix]]
- [[_COMMUNITY_Tools Documentation|Tools Documentation]]

## God Nodes (most connected - your core abstractions)
1. `getWorkspace()` - 41 edges
2. `_startOpenClawImpl()` - 26 edges
3. `AGENTS.md — Bot Operating Rules` - 22 edges
4. `Product Marketing Context Document (.agents/product-marketing-context.md)` - 20 edges
5. `Pricing Strategy Skill` - 18 edges
6. `Launch Strategy Skill` - 17 edges
7. `Page CRO Skill` - 17 edges
8. `runCronAgentPrompt()` - 16 edges
9. `getBundledVendorDir()` - 15 edges
10. `Marketing Ops Skill (Central Router)` - 15 edges

## Surprising Connections (you probably didn't know these)
- `MODOROClaw QR Code` --semantically_similar_to--> `Zalo Setup via QR Scan`  [AMBIGUOUS] [semantically similar]
  qr.png → docs/ZOOM-CAI-DAT-GUIDE.pdf
- `Sales Playbook Live Reload (bot reads on every session, no restart)` --semantically_similar_to--> `Context Optimization Design (Approach 2: Smart Context)`  [INFERRED] [semantically similar]
  knowledge/sales-playbook.md → docs/superpowers/specs/2026-04-10-context-optimization-design.md
- `Skill: General (All Industries)` --semantically_similar_to--> `CEO Escalation Boundary (Bot Asks Before Acting)`  [INFERRED] [semantically similar]
  skills/tong-quat.md → prompts/training/tong-quat.md
- `Hierarchical Memory System (OpenClaw)` --semantically_similar_to--> `Zalo User Profiles (memory/zalo-users/<id>.md)`  [INFERRED] [semantically similar]
  Hierarchical-Memory-System.txt → AGENTS.md
- `Key Features Demo for CEO (Overview, Knowledge, Pause)` --semantically_similar_to--> `Knowledge Cabinet (Document Store)`  [INFERRED] [semantically similar]
  docs/ZOOM-CAI-DAT-GUIDE.pdf → docs/HUONG-DAN-SU-DUNG.md

## Hyperedges (group relationships)
- **MODOROClaw Runtime Stack (4 Core Processes)** — README_electron_app, README_openclaw_gateway, README_9router_gateway, README_openzca_daemon [EXTRACTED 1.00]
- **Fresh-Install Defense Pattern (seedWorkspace + ensureXxx + smoke-test)** — CLAUDE_seed_workspace, CLAUDE_ensure_xxx_fix, CLAUDE_ensure_default_config, CLAUDE_smoke_test, CLAUDE_fresh_install_parity [EXTRACTED 1.00]
- **Bot Session Context Loading Chain (Identity + Company + Memory)** — IDENTITY_identity_md, COMPANY_company_md, SOUL_soul_md, MEMORY_memory_md, AGENTS_session_bootstrap_order [EXTRACTED 0.95]
- **MODOROClaw Installation Documentation Stack** — huong_dan_chuan_bi_pre_install_checklist, huong_dan_cai_dat_installation_guide, zoom_install_guide_remote_session [INFERRED 0.90]
- **Customer Onboarding Funnel (Form → Install → Wizard)** — google_form_spec_customer_registration_form, huong_dan_cai_dat_wizard_steps, plan_ceo_workspace_phase5_wizard [INFERRED 0.85]
- **Bot Knowledge Sources (Company, Products, Knowledge Tab)** — huong_dan_cai_dat_company_md, huong_dan_cai_dat_products_md, spec_knowledge_tab_3_folders [INFERRED 0.88]
- **Zalo Channel Management (OA, blocklist, shop state)** — setup_checklist_zalo_oa, shop_state_format_schema, huong_dan_su_dung_zalo_management [INFERRED 0.82]
- **Context + Memory Evolution Plans (V2 → Compaction → Optimization)** — plan_v2_2026_04_06, plan_context_compaction_2026_04_08, plan_context_optimization_2026_04_10 [INFERRED 0.85]
- **Spec-Plan Pairing (CEO Workspace Design ↔ Implementation Plan)** — spec_ceo_workspace_design_2026_04_04, plan_ceo_workspace_2026_04_04, session_log_2026_04_07 [INFERRED 0.80]
- **4-Part Context Optimization Strategy (A+B+C+D → no info loss)** — spec_context_part_a, spec_context_part_b, spec_context_part_c, spec_context_part_d [EXTRACTED 1.00]
- **Google Calendar 3-Tier Booking Flow (embed → API → auto-bot)** — spec_gcal_tier1_embed, spec_gcal_tier2_api, spec_gcal_tier3_auto_booking [EXTRACTED 1.00]
- **Universal Cron Pattern Across All Industries (morning + evening)** — industry_cron_morning_report, industry_cron_evening_summary, industry_tong_quat [EXTRACTED 1.00]
- **Session Lifecycle Protocols (Start + Heartbeat + Meditation)** — prompts_session_start, prompts_heartbeat, prompts_meditation [INFERRED 0.85]
- **Real Estate Industry SOP + Training + Persona Triad** — sop_bat_dong_san, training_bat_dong_san, em-sale-bds-sg_persona [INFERRED 0.82]
- **Core Files Always Read at Session Start (IDENTITY + SOUL + session-start protocol)** — identity_md_ref, soul_md_ref, prompts_session_start [EXTRACTED 1.00]
- **Industry Vertical: Paired Training Guide + Skill File for Each Sector** — training_fnb_guide, skill_fnb, concept_industry_skill_verticals [INFERRED 0.90]
- **CEO AI Operational Loop: Telegram + Zalo + Cron Automation** — concept_telegram_interface, concept_zalo_customer_channel, concept_cron_automation [INFERRED 0.88]
- **Agent Identity Reflections: Partnership, Boldness, Meaningful Work** — reflection_assistant_vs_partner, reflection_bold_vs_cautious, reflection_meaningful_work [INFERRED 0.85]
- **C-Suite Advisory Suite — 8 Integrated C-Level Roles** — cfo_advisor, cto_advisor, cro_advisor, cmo_advisor, chro_advisor, coo_advisor, cpo_advisor, ciso_advisor [EXTRACTED 1.00]
- **Internal Quality Loop — Protocol Shared Across All C-Level Advisors** — cfo_advisor, cto_advisor, cro_advisor [EXTRACTED 1.00]
- **Content Production Workflow — Strategy + Production + Humanization** — content_strategist, content_production, content_humanizer [EXTRACTED 1.00]
- **Social Media Ecosystem — Management, Analysis, Platform-Specific Growth** — social_media_manager, social_media_analyzer, x_twitter_growth [INFERRED 0.90]
- **Revenue Growth Triad — CFO/CRO/CMO Financial and Revenue Alignment** — cfo_advisor, cro_advisor, cmo_advisor [EXTRACTED 1.00]
- **Security and Compliance Cluster — CISO + SOC2 + Zero Trust** — ciso_advisor, soc2_compliance, concept_zero_trust [EXTRACTED 1.00]
- **Multi-Channel Analytics — Campaign, Social, and Attribution** — campaign_analytics, social_media_analyzer, concept_attribution_modeling [INFERRED 0.85]
- **Video Content Repurposing — Strategy, Atomization, Social Distribution** — video_content_strategist, concept_content_atomization, social_media_manager [EXTRACTED 0.95]
- **New Product Launch Campaign Orchestration (Content → Copy → Email → Ads → Analytics)** — content_strategy, copywriting, email_sequence, ad_creative, analytics_tracking [EXTRACTED 1.00]
- **Conversion Optimization Sprint (CRO Audit → Copy → A/B Test → Analytics)** — copywriting, ab_test_setup, analytics_tracking [EXTRACTED 1.00]
- **Paid Acquisition Stack (LinkedIn + Google + Meta Ads via Demand Acquisition)** — tool_linkedin_ads, tool_google_ads, tool_meta_ads [EXTRACTED 1.00]
- **ADKAR Applied to Process / Org / Strategy / Culture Changes** — concept_adkar, change_management, chro_advisor [INFERRED 0.80]
- **Transactional Email System (React Email + Provider + Tracking)** — email_template_builder, concept_react_email, tool_resend [EXTRACTED 1.00]
- **Churn Prevention Lifecycle (Prevention → Cancel Flow → Dunning → Win-Back Email)** — churn_prevention, concept_dunning_stack, email_sequence [EXTRACTED 1.00]
- **AI SEO Three Pillars (Structure + Authority + Presence)** — ai_seo, concept_geo_research, competitor_alternatives [EXTRACTED 1.00]
- **Customer Research → Insights → Copy Pipeline** — customer_research, concept_jtbd, copywriting [INFERRED 0.85]
- **Compounding Organic Growth (Content + SEO + Community)** — concept_compounding_channel, content_strategy, community_marketing [INFERRED 0.80]
- **Marketing Ops Routing Hub (marketing-ops → skills ecosystem)** — marketing_ops, marketing_skill, marketing_index [EXTRACTED 1.00]
- **CRO Conversion Funnel Cluster (Page, Signup, Onboarding, Paywall)** — page_cro_skill, signup_flow_cro_skill, onboarding_cro_skill, paywall_upgrade_cro_skill [INFERRED 0.90]
- **Lead Generation Cluster (Lead Magnets, Free Tools, Popup, Form)** — lead_magnets_skill, free_tool_strategy_skill, popup_cro_skill, form_cro_skill [INFERRED 0.88]
- **Technical SEO Cluster (SEO Audit, Schema Markup, Site Architecture, Programmatic SEO)** — seo_audit_skill, schema_markup_skill, site_architecture_skill, programmatic_seo_skill [INFERRED 0.90]
- **Revenue and Sales Cluster (RevOps, Sales Enablement, Pricing)** — revops_skill, sales_enablement_skill, pricing_strategy_skill [INFERRED 0.88]
- **Psychology Applied to Pricing (Loss Aversion, Anchoring, Decoy Effect)** — concept_loss_aversion, concept_anchoring_effect, concept_decoy_pricing [EXTRACTED 0.95]
- **All Marketing Skills Depend on Product Marketing Context Document** — form_cro_skill, free_tool_strategy_skill, launch_strategy_skill, lead_magnets_skill, marketing_ideas_skill, marketing_psychology_skill, onboarding_cro_skill, page_cro_skill, paid_ads_skill, paywall_upgrade_cro_skill, popup_cro_skill, pricing_strategy_skill, programmatic_seo_skill, referral_program_skill, revops_skill, sales_enablement_skill, schema_markup_skill, seo_audit_skill, signup_flow_cro_skill, site_architecture_skill [EXTRACTED 1.00]
- **Board Governance Skill Cluster (Prep, Deck, Meeting)** — board_prep_skill, board_deck_builder_skill, board_meeting_skill [INFERRED 0.90]
- **SaaS Revenue Analytics Toolkit (CSM + RevOps + Sales Engineer)** — csm_skill, revenue_operations_skill, sales_engineer_skill [EXTRACTED 1.00]
- **GTM Strategy Cluster (PMM + Launch + Pricing)** — marketing_strategy_pmm_skill, launch_strategy_skill, pricing_strategy_skill [INFERRED 0.85]
- **Security Tools (Filter + Logger)** — tool_security_outbound_filter, tool_security_audit_logger, tool_security [EXTRACTED 1.00]
- **Board Meeting Protocol Phases (Contributions + Memory + Synthesis)** — board_meeting_independent_contributions, board_meeting_two_layer_memory, board_meeting_6phase_protocol [EXTRACTED 1.00]

## Communities

### Community 0 - "Core Electron Runtime"
Cohesion: 0.02
Nodes (190): appDataDir(), appendPerCustomerSummaries(), apptDispatcherTick(), auditLog(), augmentPathWithBundledNode(), autoFix9RouterSqlite(), autoFixBetterSqlite3(), backfillKnowledgeFromDisk() (+182 more)

### Community 1 - "Agent Behavior Rules"
Cohesion: 0.03
Nodes (94): AGENTS.md — Bot Operating Rules, Zalo Blocklist (zalo-blocklist.json), Custom Crons (custom-crons.json), Bot Defense Rules (20 Categories), Follow-up Queue (follow-up-queue.json), Zalo Group Profiles (memory/zalo-groups/<id>.md), Zalo User Profiles (memory/zalo-users/<id>.md), Built-in Cron Schedules (schedules.json) (+86 more)

### Community 2 - "Marketing Psychology & CRO"
Cohesion: 0.04
Nodes (87): SavvyCal Product Hunt Case Study, Superhuman Waitlist and Onboarding Case Study, TRMNL Borrowed Channel Case Study (Snazzy Labs), Aha Moment / User Activation, Anchoring Effect, BJ Fogg Behavior Model (Motivation x Ability x Prompt), Buyer Stage Matching for Lead Magnets, Core Web Vitals (LCP, INP, CLS) (+79 more)

### Community 3 - "Customer Onboarding System"
Cohesion: 0.04
Nodes (62): MODOROClaw Customer Registration Google Form, Data Consent (NĐ 13/2023/NĐ-CP), Industry Dropdown (8 Sectors), TeamViewer Remote Installation Process, COMPANY.md — Bot Knowledge File, Installation Codes (MODORO-2026, MODORO-INSTALL, MODORO-SETUP), MODOROClaw Customer Installation Guide, PRODUCTS.md — Bot Knowledge File (+54 more)

### Community 4 - "Marketing Skill Library"
Cohesion: 0.11
Nodes (44): A/B Test Setup, Ad Creative, AI SEO (Answer Engine Optimization), Analytics Tracking, Churn Prevention, Cold Email Writing, Community Marketing, Competitor & Alternative Pages (+36 more)

### Community 5 - "Bot Session Lifecycle"
Cohesion: 0.09
Nodes (39): HEARTBEAT_OK Response Token, Industry Verticals (7 SOPs: BDS, CongNghe, DichVu, FnB, GiaoDuc, SanXuat, ThuongMai), Meditation Breakthrough — Promoting Insights to Core Files, memory_search() Function Protocol, Onboarding Template Variables ({ceo_title}, {company}, {industry}, {skills_list}), Persona System — Industry-Specific Customer Service Archetypes, Session Boot Order — File Read Sequence (IDENTITY > USER > SOUL > memory), SOP Active File — Industry-Specific Active SOP (+31 more)

### Community 6 - "Board Governance Suite"
Cohesion: 0.06
Nodes (39): Board Deck 4-Act Narrative Framework, Board Deck Bad News Delivery Framework, Board Deck Builder Skill, Board Deck 10-Section Structure, 6-Phase Board Meeting Protocol, Independent C-Suite Contributions (No Cross-Pollination), Board Meeting Protocol Skill, Two-Layer Board Memory (decisions.md + raw transcripts) (+31 more)

### Community 7 - "C-Level Advisory Framework"
Cohesion: 0.08
Nodes (34): Appointment JSON Schema with Push Targets, Board Meeting Phase 2 Isolation (Independent Analysis), Chief of Staff Role Routing Matrix, CEO Escalation Boundary (Bot Asks Before Acting), Cron-Based Automated Reporting and Reminders, Founder Behavior Signals (Side Project Energy, Autonomy Drive), Industry-Specific Skill Verticals for SMB CEOs, Investment Scoring Rubric (ROI, Payback, NPV, IRR) (+26 more)

### Community 8 - "Executive Advisory Skills"
Cohesion: 0.14
Nodes (34): Campaign Analytics, CFO Advisor, Change Management Playbook, CHRO Advisor, CISO Advisor, CMO Advisor, ADKAR Change Model (Prosci), Architecture Decision Records (ADR) (+26 more)

### Community 9 - "Industry Vertical Playbooks"
Cohesion: 0.11
Nodes (30): Industry Playbook: Real Estate (Bất động sản), Industry CEO Delegation Pattern (remind / memorize / draft), Industry Playbook: Technology & IT (Công nghệ và IT), Industry Cron Pattern: 21:00 Evening Summary (all industries), Industry Cron Pattern: 07:30 Morning Report (all industries), Industry Playbook: Services — Spa, Salon, Clinic (Dịch vụ), Industry Playbook: F&B — Restaurant, Cafe, Beverage Chain, Industry Playbook: Education & Training (Giáo dục và Đào tạo) (+22 more)

### Community 10 - "Product User Manual"
Cohesion: 0.1
Nodes (29): 9BizClaw Product, Bot Auto-Reply on Telegram and Zalo, Auto-Reply Bot (24/7 Telegram + Zalo), Bot Persona Customization, Bot Personality Customisation, Google Calendar Integration (Coming Soon), Channel Pause / Resume Control, Dashboard Tabs (Overview, Telegram, Zalo, Knowledge, Schedule, Settings) (+21 more)

### Community 11 - "Sales Playbook & Rules"
Cohesion: 0.11
Nodes (19): Sales Playbook (quy tắc bán hàng riêng của shop), Universal Persona Pattern: Escalate Complex/Rude Cases to CEO, Sales Rule: Attitude — Escalate on Rude Customers Immediately, Sales Rule: Max 10% Discount — Escalate Below Threshold, Sales Playbook Live Reload (bot reads on every session, no restart), Sales Rule: Non-Negotiable Policies (no credit, no refund after 24h), Sales Rule: Upsell Triggers (hesitation → free shipping or gift), Sales Rule: VIP Customer Tag — Priority + Free Ship + Telegram Alert (+11 more)

### Community 12 - "Content & Brand Strategy"
Cohesion: 0.18
Nodes (18): Brand Guidelines, AI Tell Patterns (Content Humanization), Brand Voice and Visual Identity System, Content Atomization / Repurposing Framework, Content Production Pipeline, Social Media Engagement Metrics and Benchmarks, SEO Content Optimization, Topic Cluster Content Strategy (+10 more)

### Community 13 - "Vendor Build Pipeline"
Cohesion: 0.37
Nodes (16): bundledNodeBinPath(), detectBinaryArch(), detectTargetArch(), detectTargetPlatform(), downloadAndExtractNode(), downloadFile(), fatal(), fixNineRouterNativeModules() (+8 more)

### Community 14 - "Google Calendar Auth"
Cohesion: 0.23
Nodes (11): disconnect(), exchangeCode(), getAccessToken(), getEmail(), httpsGet(), httpsPost(), isConnected(), loadTokens() (+3 more)

### Community 15 - "OpenZalo Plugin Patches"
Cohesion: 0.36
Nodes (6): resolveOpenzcaCliJs(), runOpenzcaCommand(), runOpenzcaInteractive(), runOpenzcaJson(), runOpenzcaStreaming(), shellSafeArgs()

### Community 16 - "SQLite Binary Fixer"
Cohesion: 0.44
Nodes (7): detectBinaryArch(), isBinaryPresent(), isBinaryUsable(), log(), tryPrebuild(), tryRebuild(), warn()

### Community 17 - "Smoke Test Suite"
Cohesion: 0.36
Nodes (5): checkPatchAnchor(), checkVendorVersion(), fail(), pass(), warn()

### Community 18 - "Release & Distribution"
Cohesion: 0.28
Nodes (9): DMG Build Process (Mac), Electron App Architecture (Mac), macOS Gatekeeper Issue (Unsigned DMG), README-MAC.md — macOS Build/Install Guide, push-to-mac-repo.bat Script, RELEASE-STRATEGY.md — Dual-Repo Release Process, release-windows.bat Script, modoro-digital/MODOROClaw-Setup (Installer Repo) (+1 more)

### Community 19 - "Onboarding UX Design"
Cohesion: 0.22
Nodes (9): User Profile Template (Hồ Sơ Chủ Nhân), In-App Onboarding Redesign Spec, Contextual Tooltips via CSS data-tooltip (no JS tour library), Jargon Rename: Developer Terms → CEO-Friendly Terms, Rationale: No Tour Popups — Smart Empty States Instead, Post-Onboarding Nudges (week 1: Knowledge, Cron, Zalo owner), Onboarding Principle: App Self-Explains — CEO Needs No Learning, Smart Empty States (sections become guides when data is empty) (+1 more)

### Community 20 - "Core Test Utilities"
Cohesion: 0.33
Nodes (2): getVendorDir(), getWorkspace()

### Community 21 - "Security Audit Logger"
Cohesion: 0.33
Nodes (6): get_recent_actions(), log_action(), print_summary(), Log an external action.          Args:         action: Type of action (send_e, Get actions from the last N hours., Print a summary of recent actions.

### Community 22 - "Calendar Integration"
Cohesion: 0.5
Nodes (2): getFreeBusy(), getFreeSlotsForDay()

### Community 23 - "Zalo Management Tool"
Cohesion: 0.4
Nodes (0): 

### Community 24 - "Development Session Log"
Cohesion: 0.5
Nodes (5): Session Log 2026-04-06 ~ 2026-04-07, Custom Cron System (file-based, custom-crons.json), Pairing Required Bug Fix (openclaw cron add), Skill/Industry File Audit — Removed Fake Capabilities, Telegram Slash Commands Registration (12 Commands)

### Community 25 - "Calendar Config"
Cohesion: 0.83
Nodes (3): configPath(), read(), write()

### Community 26 - "Example Tool Template"
Cohesion: 0.83
Nodes (3): main(), processInput(), showHelp()

### Community 27 - "Outbound Security Filter"
Cohesion: 0.67
Nodes (3): main(), Scan text for potential secrets., scan_text()

### Community 28 - "Zalo Safe Send"
Cohesion: 0.67
Nodes (0): 

### Community 29 - "Memory DB Rebuilder"
Cohesion: 0.67
Nodes (0): 

### Community 30 - "Embed WebUI Design"
Cohesion: 0.67
Nodes (3): Embed 9Router + OpenClaw Web UI Design Spec (2026-04-07), XFO/CSP Header Stripper for Trusted Local Origins, Iframe Lazy Load Pattern

### Community 31 - "Security Tool Index"
Cohesion: 0.67
Nodes (3): Security Tools (outbound_filter + audit_logger), Audit Logger (audit_logger.py), Outbound Security Filter (outbound_filter.py)

### Community 32 - "Mac Build Script"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Memory Write Tool"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Memory Search Tool"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Board Communication Hub"
Cohesion: 1.0
Nodes (2): AgentHub Board Channels (dispatch/progress/results), AgentHub Message Board Skill

### Community 36 - "Tool Index References"
Cohesion: 1.0
Nodes (2): Example Tool Template, Memory Database Tool (SQLite + FTS5)

### Community 37 - "Electron Preload Bridge"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Zalo Blocklist Patch"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Mac Universal Build"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Background Remover"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Knowledge Tab Bootstrap"
Cohesion: 1.0
Nodes (1): Knowledge Tab (Dashboard)

### Community 42 - "Run Script Reference"
Cohesion: 1.0
Nodes (1): RUN.bat (Launch Script)

### Community 43 - "Mac App Nap Fix"
Cohesion: 1.0
Nodes (1): Mac App Nap/powerSaveBlocker Fix (v2.2.7)

### Community 44 - "Tools Documentation"
Cohesion: 1.0
Nodes (1): TOOLS.md — Local Environment Notes

## Ambiguous Edges - Review These
- `MODOROClaw QR Code` → `Zalo Setup via QR Scan`  [AMBIGUOUS]
  qr.png · relation: semantically_similar_to

## Knowledge Gaps
- **210 isolated node(s):** `Log an external action.          Args:         action: Type of action (send_e`, `Get actions from the last N hours.`, `Print a summary of recent actions.`, `Scan text for potential secrets.`, `[ZALO_CHU_NHAN] Owner Marker` (+205 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Mac Build Script`** (2 nodes): `run()`, `build-mac-safe.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Memory Write Tool`** (2 nodes): `memoryWrite()`, `memory-write.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Memory Search Tool`** (2 nodes): `searchMemory()`, `relevant-memory.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Board Communication Hub`** (2 nodes): `AgentHub Board Channels (dispatch/progress/results)`, `AgentHub Message Board Skill`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tool Index References`** (2 nodes): `Example Tool Template`, `Memory Database Tool (SQLite + FTS5)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Electron Preload Bridge`** (1 nodes): `preload.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Zalo Blocklist Patch`** (1 nodes): `apply-zalo-blocklist.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Mac Universal Build`** (1 nodes): `build-mac-universal.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Background Remover`** (1 nodes): `remove-bg.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Knowledge Tab Bootstrap`** (1 nodes): `Knowledge Tab (Dashboard)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Run Script Reference`** (1 nodes): `RUN.bat (Launch Script)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Mac App Nap Fix`** (1 nodes): `Mac App Nap/powerSaveBlocker Fix (v2.2.7)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tools Documentation`** (1 nodes): `TOOLS.md — Local Environment Notes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `MODOROClaw QR Code` and `Zalo Setup via QR Scan`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `Launch Strategy Skill` connect `Marketing Psychology & CRO` to `Board Governance Suite`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `Pricing Strategy Skill` connect `Marketing Psychology & CRO` to `Board Governance Suite`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `Log an external action.          Args:         action: Type of action (send_e`, `Get actions from the last N hours.`, `Print a summary of recent actions.` to the rest of the system?**
  _210 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Electron Runtime` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Agent Behavior Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Marketing Psychology & CRO` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._