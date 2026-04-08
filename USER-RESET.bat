@echo off
title MODOROClaw - User Machine Full Reset
echo.
echo   FULL RESET tren may khach (xoa sach OpenClaw + 9Router + Zalo cu)
echo   ================================================================
echo.
echo   CANH BAO: script nay xoa toan bo config, session, knowledge,
echo   cron, memory cua MODOROClaw + OpenClaw + 9Router + Zalo.
echo   Khong the undo. Bam Ctrl+C de huy, hoac phim bat ky de tiep tuc.
echo.
pause

:: ============================================================
:: 1. Kill running processes (Electron, gateway, listener, etc)
:: ============================================================
echo.
echo [1/7] Dung tat ca process...
taskkill /f /im MODOROClaw.exe 2>nul
taskkill /f /im electron.exe 2>nul
taskkill /f /im openclaw.exe 2>nul
taskkill /f /im 9router.exe 2>nul
:: Kill any node.exe spawned by gateway/openzca/9router. Be careful: this kills
:: ALL node.exe on the machine, including unrelated dev work. Comment out if
:: the user has other Node apps running they want to keep alive.
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul

:: ============================================================
:: 2. Uninstall any GLOBAL openclaw / 9router from old npm install
::    (legacy: before full-bundled EXE shipped these inside vendor/)
:: ============================================================
echo [2/7] Go global npm packages cu (openclaw, 9router, openzca)...
call npm uninstall -g openclaw 2>nul
call npm uninstall -g 9router 2>nul
call npm uninstall -g openzca 2>nul
call npm uninstall -g @tuyenhx/openzalo 2>nul
:: Stale shims that npm uninstall may leave behind
if exist "%APPDATA%\npm\openclaw.cmd"   del "%APPDATA%\npm\openclaw.cmd"
if exist "%APPDATA%\npm\openclaw"        del "%APPDATA%\npm\openclaw"
if exist "%APPDATA%\npm\9router.cmd"     del "%APPDATA%\npm\9router.cmd"
if exist "%APPDATA%\npm\9router"         del "%APPDATA%\npm\9router"
if exist "%APPDATA%\npm\openzca.cmd"     del "%APPDATA%\npm\openzca.cmd"
if exist "%APPDATA%\npm\openzca"         del "%APPDATA%\npm\openzca"
:: Stale node_modules dirs from old global installs
if exist "%APPDATA%\npm\node_modules\openclaw"          rmdir /s /q "%APPDATA%\npm\node_modules\openclaw"
if exist "%APPDATA%\npm\node_modules\9router"           rmdir /s /q "%APPDATA%\npm\node_modules\9router"
if exist "%APPDATA%\npm\node_modules\openzca"           rmdir /s /q "%APPDATA%\npm\node_modules\openzca"
if exist "%APPDATA%\npm\node_modules\@tuyenhx"          rmdir /s /q "%APPDATA%\npm\node_modules\@tuyenhx"

:: ============================================================
:: 3. OpenClaw config + data (token Telegram, schedules, agents)
:: ============================================================
echo [3/7] Xoa OpenClaw config + data (~/.openclaw)...
if exist "%USERPROFILE%\.openclaw" rmdir /s /q "%USERPROFILE%\.openclaw"

:: ============================================================
:: 4. 9Router config (providers, OAuth tokens, db.json password)
:: ============================================================
echo [4/7] Xoa 9Router config (%%APPDATA%%\9router)...
if exist "%APPDATA%\9router" rmdir /s /q "%APPDATA%\9router"

:: ============================================================
:: 5. Zalo session (openzca cookies, listener-owner.json)
:: ============================================================
echo [5/7] Xoa Zalo session (~/.openzca)...
if exist "%USERPROFILE%\.openzca" rmdir /s /q "%USERPROFILE%\.openzca"

:: ============================================================
:: 6. MODOROClaw electron userData
::    Packaged EXE writes EVERYTHING here:
::      - vendor\ (extracted Node + plugins, ~1.6 GB)
::      - vendor-version.txt (extract stamp)
::      - workspace files (schedules.json, custom-crons.json, knowledge\, memory\)
::      - logs\, openclaw.json (NEW location for packaged builds)
::      - sticky chatId, modoroclaw-sticky-chatid.json
::    Wiping this dir = true fresh install. Next launch will:
::      - Re-extract vendor-bundle.tar from resources\ (~30-60s, splash bar)
::      - Re-run wizard (Telegram token + Zalo + business info)
:: ============================================================
echo [6/7] Xoa MODOROClaw userData (%%APPDATA%%\modoro-claw)...
echo        (gom vendor extracted ~1.6 GB - lan chay ke se giai nen lai)
if exist "%APPDATA%\modoro-claw" rmdir /s /q "%APPDATA%\modoro-claw"

:: Legacy app names from older versions (just in case)
if exist "%APPDATA%\MODOROClaw"   rmdir /s /q "%APPDATA%\MODOROClaw"
if exist "%APPDATA%\Modoro-Claw"  rmdir /s /q "%APPDATA%\Modoro-Claw"
if exist "%APPDATA%\modoroclaw"   rmdir /s /q "%APPDATA%\modoroclaw"

:: ============================================================
:: 7. Old standalone schedule files (very early versions)
:: ============================================================
echo [7/7] Xoa legacy schedule files...
if exist "%APPDATA%\claw-schedules.json" del "%APPDATA%\claw-schedules.json"

echo.
echo   Done! May khach gio sach hoan toan.
echo.
echo   Buoc tiep theo:
echo     1. Mo MODOROClaw tu Start Menu / Desktop shortcut
echo     2. Cho splash giai nen vendor (~30-60 giay, co progress bar)
echo     3. Wizard hien len - nhap lai Telegram token + Zalo QR + business info
echo.
pause
