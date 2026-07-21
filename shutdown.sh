#!/bin/bash

# HCDS Studio 一键关闭脚本

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PORTS=(3001 5173 8765)

log() {
    echo -e "$1"
}

collect_port_pids() {
    local port=$1
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
}

collect_project_pids() {
    {
        pgrep -f "$ROOT_DIR/backend/node_modules/.bin/nodemon" 2>/dev/null || true
        pgrep -f "$ROOT_DIR/backend/src/app.js" 2>/dev/null || true
        pgrep -f "$ROOT_DIR/frontend/node_modules/.bin/vite" 2>/dev/null || true
        pgrep -f "$ROOT_DIR/frontend/node_modules/vite" 2>/dev/null || true
        pgrep -f "qwen_asr_sync_server|mlx-qwen3-asr|qwen-asr-venv" 2>/dev/null || true
    } | sort -u
}

collect_all_pids() {
    {
        for port in "${PORTS[@]}"; do
            collect_port_pids "$port"
        done
        collect_project_pids
    } | awk -v self="$$" 'NF && $1 != self { print $1 }' | sort -u
}

print_listeners() {
    local found=0

    for port in "${PORTS[@]}"; do
        if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
            found=1
            log "${YELLOW}端口 ${port} 仍有监听进程:${NC}"
            lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
        fi
    done

    [ "$found" -eq 1 ]
}

terminate_pids() {
    local signal=$1
    shift

    if [ "$#" -eq 0 ]; then
        return 0
    fi

    kill "-$signal" "$@" 2>/dev/null || true
}

pids=($(collect_all_pids))

if [ "${#pids[@]}" -eq 0 ]; then
    log "${GREEN}没有发现需要关闭的 HCDS Studio 服务${NC}"
    exit 0
fi

log "${YELLOW}正在关闭 HCDS Studio 相关服务...${NC}"
terminate_pids TERM "${pids[@]}"
sleep 2

remaining_pids=($(collect_all_pids))
if [ "${#remaining_pids[@]}" -gt 0 ]; then
    log "${YELLOW}部分进程未退出，正在强制关闭...${NC}"
    terminate_pids KILL "${remaining_pids[@]}"
    sleep 1
fi

if print_listeners; then
    log "${RED}仍有项目端口被占用，请确认后手动处理上方进程${NC}"
    exit 1
fi

log "${GREEN}已关闭所有 HCDS Studio 相关服务${NC}"
