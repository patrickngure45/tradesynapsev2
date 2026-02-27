@echo off
cd /d "C:\Users\ngure\tradesynapsev2\apps\web"
REM Load environment from .env.production
for /f "delims== tokens=1,2" %%G in (.env.production) do set "%%G=%%H"
set EMAIL=ngurengure10@gmail.com
set CONFIRM_RESET_2FA=RESET_2FA
call npm run user:reset-2fa
pause
