#!/usr/bin/env bash
export PORT=8080
nohup npm run dev > output.log 2>&1 &
