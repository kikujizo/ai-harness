@echo off
chcp 65001 >nul
setlocal

rem Create .claude\skills as a junction to .agents\skills (Skill SSOT).
rem Run from the repository root. Use --check to verify only.
rem Messages are ASCII on purpose: Japanese text in a .bat breaks cmd tokenizing on CP932 consoles.

set "LINK=.claude\skills"
set "TARGET=.agents\skills"

if /i "%~1"=="--check" goto check

if not exist "%TARGET%\" goto notarget
if not exist "%LINK%" goto make

rem %LINK% exists: decide junction vs real folder
dir /a:l ".claude" 2>nul | findstr /i /c:"skills" >nul
if errorlevel 1 goto realdir
echo [OK] %LINK% is already a junction.
goto verify

:make
mklink /j "%LINK%" "%TARGET%" >nul
if errorlevel 1 goto mkfail
echo [OK] created junction: %LINK% -^> %TARGET%
goto verify

:check
if not exist "%LINK%" goto checkmissing
dir /a:l ".claude" 2>nul | findstr /i /c:"skills" >nul
if errorlevel 1 goto notjunction
goto verify

:verify
if not exist "%LINK%\pm-review\SKILL.md" goto verifyfail
echo [OK] reachable: %LINK%\pm-review\SKILL.md
exit /b 0

:notarget
echo [ERROR] SSOT folder %TARGET% not found. Run from the repository root.
exit /b 1

:realdir
echo [WARN] %LINK% exists as a real folder. Not deleting automatically. Inspect and resolve manually.
exit /b 1

:mkfail
echo [ERROR] failed to create junction. Check you are at the repository root (no admin rights needed).
exit /b 1

:checkmissing
echo [NG] %LINK% missing. Run setup-links.bat first.
exit /b 1

:notjunction
echo [NG] %LINK% is not a junction (looks like a real folder).
exit /b 1

:verifyfail
echo [NG] not reachable: %LINK%\pm-review\SKILL.md
exit /b 1
