@echo off
chcp 65001 >nul
:menu
cls
echo ========================================
echo    Навигатор - Управление сервером
echo ========================================
echo.
echo Выберите действие:
echo.
echo [1] Запустить сервер
echo [2] Перезапустить сервер
echo [3] Остановить сервер
echo [4] Выход
echo.
set /p choice="Введите номер действия (1-4): "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto restart
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto end
echo Неверный выбор. Попробуйте снова.
timeout /t 2 >nul
goto menu

:start
cls
echo ========================================
echo    Запуск сервера Навигатор
echo ========================================
echo.
echo Если nodemon не установлен, будет выполнена установка...
echo.
if exist node_modules\nodemon (
    echo Запуск сервера с nodemon...
    echo Для остановки нажмите Ctrl+C
    echo.
    npm run dev
) else (
    echo nodemon не найден. Установка...
    npm install --save-dev nodemon
    echo.
    echo Запуск сервера с nodemon...
    echo Для остановки нажмите Ctrl+C
    echo.
    npm run dev
)
goto end

:restart
cls
echo ========================================
echo    Перезапуск сервера Навигатор
echo ========================================
echo.
echo Остановка текущего сервера...
echo.

REM Поиск и остановка процессов Node.js на порту 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Найден процесс на порту 3000, PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo Процесс %%a остановлен.
    )
)

REM Дополнительная проверка всех процессов node.exe
echo Проверка процессов Node.js...
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST ^| findstr "PID:"') do (
    echo Остановка процесса Node.js PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 >nul
echo.
echo Запуск нового сервера...
echo.

if exist node_modules\nodemon (
    echo Запуск сервера с nodemon...
    echo Для остановки нажмите Ctrl+C
    echo.
    npm run dev
) else (
    echo nodemon не найден. Установка...
    npm install --save-dev nodemon
    echo.
    echo Запуск сервера с nodemon...
    echo Для остановки нажмите Ctrl+C
    echo.
    npm run dev
)
goto end

:stop
cls
echo ========================================
echo    Остановка сервера Навигатор
echo ========================================
echo.
echo Поиск процессов на порту 3000...
echo.

REM Поиск и остановка процессов Node.js на порту 3000
set found=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Найден процесс на порту 3000, PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo Процесс %%a остановлен.
        set found=1
    )
)

if "%found%"=="0" (
    echo Процессы на порту 3000 не найдены.
    echo Попытка остановить все процессы Node.js...
    for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST ^| findstr "PID:"') do (
        echo Остановка процесса Node.js PID: %%a
        taskkill /PID %%a /F >nul 2>&1
    )
)

echo.
echo Сервер остановлен.
timeout /t 3 >nul
goto menu

:end
echo.
echo Выход...
timeout /t 1 >nul
exit
