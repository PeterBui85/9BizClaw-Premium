# Zalo Menu Dry-Run UI Implementation Plan

Date: 2026-05-27

## Reference Spec

Implement against `docs/superpowers/specs/2026-05-27-zalo-menu-dry-run-ui-design.md`.

## V1 Order

1. Dashboard UI foundation.
2. Admin-only menu catalog storage.
3. XLSX template download and import.
4. Dry-run command preview.
5. Zalo command dispatch after Dashboard UI is verified.

Dashboard UI work is part of v1 and must happen before Zalo command dispatch implementation.

## Current Scope

- Add `Tổng quan` and `Menu` subtabs inside the Zalo page.
- Keep the existing Zalo management experience under `Tổng quan`.
- Add the Menu dry-run workspace with catalog, import, template download, and preview.
- Improve group/friend list readability for smaller laptop screens.
- Keep payment, QR, bank transfer, and SePay out of v1.

## Follow-Up Scope

- Wire customer-facing Zalo command dispatch to the verified catalog.
- Add final message sanitation rules for production sending.
- Add SePay webhook/payment work only after menu command dispatch is stable.
