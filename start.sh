#!/bin/bash

# HCDS Studio 一键启动脚本

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cleanup() {
    echo ""
    echo -e "${YELLOW}正在停止服务...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}已停止所有服务${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未找到 Node.js，请先安装 Node.js >= 18${NC}"
    exit 1
fi

# 安装依赖
install_deps() {
    local dir=$1
    local name=$2
    if [ ! -d "$dir/node_modules" ]; then
        echo -e "${YELLOW}安装 ${name} 依赖...${NC}"
        cd "$dir" && npm install
    fi
}

install_deps "$ROOT_DIR/backend" "后端"
install_deps "$ROOT_DIR/frontend" "前端"

echo -e "${GREEN}启动后端服务...${NC}"
cd "$ROOT_DIR/backend" && npm run dev &
BACKEND_PID=$!

echo -e "${GREEN}启动前端服务...${NC}"
cd "$ROOT_DIR/frontend" && npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  HCDS Studio 已启动${NC}"
echo -e "${GREEN}  前端: http://localhost:5173${NC}"
echo -e "${GREEN}  后端: http://localhost:3001${NC}"
echo -e "${GREEN}  按 Ctrl+C 停止所有服务${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

wait
