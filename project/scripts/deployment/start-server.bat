@echo off
REM Start BOTH runtimes: the Next.js app and the Python intelligence service.
REM Starting only `npm start` leaves OCR / damage review / AI / system-status
REM features returning 502 because the Python service is not listening.
cd /d "C:\Users\darak\Downloads\finall caranimation"
npm run start:all > "server.log" 2>&1
