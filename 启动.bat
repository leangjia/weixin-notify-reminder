@echo off
chcp 65001 >nul
title RoHS System

cd /d "%~dp0weixin-notify-reminder"

if not exist "node_modules" (
    call npm install
)

call npm start