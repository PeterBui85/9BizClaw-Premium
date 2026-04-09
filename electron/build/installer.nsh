; MODOROClaw custom uninstaller cleanup
; Uses MessageBox prompts (compatible with electron-builder NSIS template)
; Two optional cleanup steps after default uninstall:
;   1. Remove extracted vendor (bundled Node.js + plugins) — frees ~1.8 GB
;   2. Remove ALL user data (workspace, config, Zalo session) — clean wipe

!macro customRemoveFiles
  ; Step 1: Offer to remove extracted vendor (~1.8 GB)
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Xoa Node.js va plugin da giai nen? (~1.8 GB)$\n$\nGom: vendor/node, openclaw, 9router, openzca, openzalo$\nNeu cai lai, file nay se duoc giai nen tu dau." \
    IDYES removeVendor IDNO skipVendor
  removeVendor:
    DetailPrint "Removing extracted vendor..."
    RMDir /r "$APPDATA\modoro-claw\vendor"
    Delete "$APPDATA\modoro-claw\vendor-version.txt"
    DetailPrint "Vendor removed."
  skipVendor:

  ; Step 2: Offer full data wipe
  MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "Xoa SACH moi du lieu MODOROClaw?$\n$\nGom:$\n- Workspace (AGENTS, knowledge, memory, logs)$\n- Config bot (openclaw.json, PIN, extensions)$\n- Zalo session (cookies, friend cache)$\n- 9Router (API keys, provider config)$\n$\nCANH BAO: Khong the khoi phuc sau khi xoa!" \
    IDYES removeAll IDNO skipAll
  removeAll:
    DetailPrint "Removing all user data..."
    RMDir /r "$APPDATA\modoro-claw"
    RMDir /r "$PROFILE\.openclaw"
    RMDir /r "$PROFILE\.openzca"
    RMDir /r "$APPDATA\9router"
    RMDir /r "$APPDATA\MODOROClaw"
    DetailPrint "All user data removed."
  skipAll:
!macroend
