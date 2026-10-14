@echo off
cd /d C:\Users\Administrator\Desktop\lsps
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --enable-unsafe-swiftshader --screenshot=shot3.png --window-size=1400,900 --virtual-time-budget=45000 http://localhost:5173/ > shot.log 2>&1
echo DONE >> shot.log
