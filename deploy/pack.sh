#!/usr/bin/env bash
# =============================================================================
# CloudCLI — 打包脚本
#
# 功能:
#   1. 构建前端 (vite build → dist/)
#   2. 打包应用源码为 cloudcli.tar.gz
#   3. 将 cloudcli.tar.gz + install.sh + uninstall.sh 合并为部署包
#      cloudcli-deploy.tar.gz
#
# 用法:
#   ./deploy/pack.sh
#
# 产出:
#   cloudcli-deploy.tar.gz  (发给同事，解压后 sudo ./install.sh 即可)
# =============================================================================

set -euo pipefail

# ── 颜色 ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

Info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
Ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
Warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
Error() { echo -e "${RED}[ERROR]${NC} $*"; >&2; }

# ── 定位项目根目录 ────────────────────────────────────────────────────────────
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
cd "$PROJECT_ROOT"

Info "项目根目录: ${PROJECT_ROOT}"

# ── 构建前端 ──────────────────────────────────────────────────────────────────
Info "构建前端 (vite build)..."
npm run build
Ok "前端构建完成 → dist/"

# ── 临时工作目录 ──────────────────────────────────────────────────────────────
STAGE_DIR=$(mktemp -d)
APP_DIR="${STAGE_DIR}/cloudcli-app"
DEPLOY_DIR="${STAGE_DIR}/cloudcli-deploy"
trap 'rm -rf "$STAGE_DIR"' EXIT

mkdir -p "$APP_DIR" "$DEPLOY_DIR"

# ── 收集应用文件 ──────────────────────────────────────────────────────────────
# 与 package.json "files" 字段保持一致，加上必要的运行时文件
Info "收集应用文件..."

INCLUDE_DIRS=(
    server
    shared
    dist
    scripts
    plugins
    public
)

INCLUDE_FILES=(
    package.json
    package-lock.json
    README.md
)

for dir in "${INCLUDE_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
        # rsync 排除 node_modules、.DS_Store 等
        rsync -a \
            --exclude='node_modules' \
            --exclude='.DS_Store' \
            --exclude='__pycache__' \
            "${dir}/" "${APP_DIR}/${dir}/"
    fi
done

for file in "${INCLUDE_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        cp "$file" "${APP_DIR}/"
    fi
done

# ── 打包应用 tar ──────────────────────────────────────────────────────────────
Info "打包应用为 cloudcli.tar.gz..."
tar czf "${DEPLOY_DIR}/cloudcli.tar.gz" -C "$STAGE_DIR" cloudcli-app

# ── 复制部署脚本 ──────────────────────────────────────────────────────────────
cp "${SCRIPT_DIR}/install.sh"   "${DEPLOY_DIR}/"
cp "${SCRIPT_DIR}/uninstall.sh" "${DEPLOY_DIR}/"
chmod +x "${DEPLOY_DIR}/install.sh" "${DEPLOY_DIR}/uninstall.sh"

# ── 生成最终部署包 ────────────────────────────────────────────────────────────
OUTPUT="${PROJECT_ROOT}/cloudcli-deploy.tar.gz"
Info "生成部署包: ${OUTPUT}"
tar czf "$OUTPUT" -C "$STAGE_DIR" cloudcli-deploy

# ── 结果 ──────────────────────────────────────────────────────────────────────
FILE_SIZE=$(du -h "$OUTPUT" | cut -f1)
Ok "打包完成！"
echo ""
echo -e "  ${GREEN}部署包:${NC}  ${OUTPUT}"
echo -e "  ${GREEN}大小:${NC}    ${FILE_SIZE}"
echo ""
echo -e "  ${BLUE}使用方法:${NC}"
echo "    1. 将 cloudcli-deploy.tar.gz 传到目标机器"
echo "    2. tar xzf cloudcli-deploy.tar.gz"
echo "    3. cd cloudcli-deploy"
echo "    4. sudo ./install.sh"
echo ""
