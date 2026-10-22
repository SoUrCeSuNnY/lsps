@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 936 >nul
title LSPS 3D 取景器
cd /d "%~dp0"

set "PORT=5173"
set "URL=http://localhost:%PORT%/"
set "MIRROR=https://registry.npmmirror.com"

echo.
echo  ==================================================
echo    LSPS  3D 取景器  ·  一键启动
echo  ==================================================
echo.

rem ---------------------------------------------------------------
rem  0. 参数： -mirror 国内镜像装依赖   -update 先拉取 GitHub 更新   -help
rem ---------------------------------------------------------------
set "USE_MIRROR=0"
for %%a in (%*) do (
  if /i "%%~a"=="-mirror" set "USE_MIRROR=1"
  if /i "%%~a"=="-update"  set "DO_UPDATE=1"
  if /i "%%~a"=="-help"    goto :help
)

rem ---------------------------------------------------------------
rem  1. 拉取更新（可选）
rem ---------------------------------------------------------------
if defined DO_UPDATE (
  where git >nul 2>nul
  if errorlevel 1 (
    echo  [!] 未检测到 git，跳过更新。
  ) else (
    echo  [..] 拉取 GitHub 更新 ...
    git pull --ff-only origin main
    if errorlevel 1 echo  [!] 更新失败（本地有未提交改动？），继续用当前版本启动。
    echo.
  )
)

rem ---------------------------------------------------------------
rem  2. Node.js 环境（package.json 要求 >= 20.19）
rem ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] 未检测到 Node.js，请先安装 v20.19 或更高：https://nodejs.org/
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
for /f "tokens=1,2 delims=." %%a in ("%NODE_VER:~1%") do (
  set "MAJ=%%a"
  set "MIN=%%b"
)
set /a MAJ+=0
if not defined MIN set "MIN=0"
set /a MIN+=0
if %MAJ% LSS 20 goto :node_old
if %MAJ% EQU 20 if %MIN% LSS 19 goto :node_old
echo  [OK] Node.js %NODE_VER%
goto :node_ok

:node_old
echo  [X] Node.js 版本过低（%NODE_VER%），本项目需要 v20.19 或更高：https://nodejs.org/
echo.
pause
exit /b 1

:node_ok
where npm >nul 2>nul
if errorlevel 1 (
  echo  [X] 未检测到 npm，请重新安装 Node.js（自带 npm）。
  echo.
  pause
  exit /b 1
)

rem ---------------------------------------------------------------
rem  3. 依赖（Cesium 体积较大，首次安装约 1-3 分钟）
rem ---------------------------------------------------------------
if exist "node_modules\cesium\Build\Cesium\" (
  echo  [OK] 依赖已就绪
) else (
  echo  [..] 首次运行，安装依赖中，请耐心等待 ...
  if "%USE_MIRROR%"=="1" (
    call npm install --registry=%MIRROR%
  ) else (
    call npm install
  )
  if errorlevel 1 (
    echo.
    echo  [X] 依赖安装失败。国内网络请改用镜像重试：
    echo        一键启动.bat -mirror
    echo.
    pause
    exit /b 1
  )
)

rem ---------------------------------------------------------------
rem  4. 本地配置（key 全部可留空，会自动降级到免密钥数据源）
rem ---------------------------------------------------------------
if not exist "apps\web\.env.local" (
  copy /y ".env.example" "apps\web\.env.local" >nul
  echo  [OK] 已生成 apps\web\.env.local（key 可留空，启动后点右上角「设置」在线填写）
)

rem ---------------------------------------------------------------
rem  5. 已在运行则直接打开浏览器
rem ---------------------------------------------------------------
curl.exe -s -m 3 "%URL%" 2>nul | findstr /i "LSPS" >nul
if not errorlevel 1 (
  echo  [OK] 开发服务器已在运行，直接打开浏览器
  echo.
  start "" "%URL%"
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)

rem ---------------------------------------------------------------
rem  6. 启动开发服务器（独立窗口，关窗即停服务）
rem ---------------------------------------------------------------
echo  [..] 启动开发服务器 ...
start "LSPS-dev-server" /min cmd /k "npm run dev"

rem 轮询等待首屏就绪（首次加载需预打包 Cesium，可能 1-2 分钟）
set /a TRY=0
:wait
curl.exe -s -m 2 -o nul "%URL%" 2>nul
if not errorlevel 1 goto :ready
set /a TRY+=1
if %TRY% GEQ 180 goto :timeout
<nul set /p ".=  ."
ping -n 2 127.0.0.1 >nul
goto :wait

:timeout
echo.
echo  [X] 等待超时：开发服务器未在 3 分钟内响应。
echo      请查看最小化的「LSPS-dev-server」窗口中的报错信息。
echo.
pause
exit /b 1

:ready
echo.
echo  [OK] 服务已就绪，正在打开浏览器 ...
echo.
echo   地址：%URL%
echo   默认场景：重庆 · 洪崖洞（自动定位当天蓝调时刻）
echo.
echo   关闭服务：关掉最小化的「LSPS-dev-server」窗口即可。
echo   首次打开若全白属正常，等 1-2 分钟后刷新。
echo.
start "" "%URL%"
ping -n 5 127.0.0.1 >nul
exit /b 0

:help
echo  用法：
echo    一键启动.bat              直接启动
echo    一键启动.bat -mirror      用国内 npm 镜像安装依赖（网络慢时用）
echo    一键启动.bat -update      先从 GitHub 拉取最新版本再启动
echo.
pause
exit /b 0
