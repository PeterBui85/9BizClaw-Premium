# Zalo Menu Dry-Run UI Design

Date: 2026-05-27

## Selected Direction

Use the selected Option 1 direction: a first-class menu workspace inside the existing Zalo tab, with a calm admin UI and a live Zalo-style preview. The Menu workspace should feel like a smooth extension of the current Dashboard, not a separate app or a modal-only workflow.

## Layout Decision

The Zalo page is split into two large subtabs under the Zalo header:

- `Tổng quan`: existing Zalo mode controls, group list, friend list, pause/status controls.
- `Menu`: new admin-only dry-run menu workspace.

This keeps day-to-day Zalo management clean while making menu authoring and dry-run visible enough for setup work.

## Laptop Readability

The overview lists must be readable on smaller laptops:

- Group and friend rows should be about 60px high.
- Names should be larger and bolder than the previous compact list.
- Descriptions and metadata should be larger and have enough line height.
- Dense row actions should be visually compressed into fewer, clearer control clusters.
- Layout must avoid overlapping controls when the app runs on smaller laptop widths.

## Menu Workspace Behavior

The `Menu` subtab contains:

- Left panel: editable menu catalog.
- Right panel: live Zalo message preview.
- Top actions: `Tải mẫu XLSX`, `Import XLSX`, `Dry-run`.
- Command input supports examples:
  - `/menu`
  - `/menu premium`
  - `/baogia premium`

Catalog behavior:

- Admin can edit catalog rows directly.
- Admin can download an XLSX template.
- Admin can import a filled XLSX file.
- Import validates required fields and duplicate slugs before applying.
- Dry-run renders the formatted message without sending anything to Zalo.
- Customer Zalo users only see final formatted menu messages after command dispatch is implemented.

## V1 Exclusions

Payment is explicitly out of scope for v1:

- No payment flow.
- No QR payment.
- No bank transfer instructions.
- No SePay webhook integration.

SePay Việt Nam remains future work after the menu dry-run and command dispatch foundation is stable.

## Assumptions

- Dry-run is admin-only in Dashboard.
- Customer Zalo never sees dry-run controls.
- V1 prioritizes Dashboard UI, import, preview, and formatting before Zalo command dispatch.
