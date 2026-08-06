#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_DIR="$ROOT_DIR/rust/aes_crypto_wasm"
FRONTEND_DIR="$ROOT_DIR/front-end"
SW_DIR="$FRONTEND_DIR/sw"
FRONTEND_WASM_DIR="$FRONTEND_DIR/wasm/xxx"
STATIC_DIR="$ROOT_DIR/static"

MEDIA_PATH=""
SKIP_CLEAN=0
START_BACKEND=0

usage() {
  cat <<'EOF'
用法:
  ./build-project.sh [选项]

功能:
  1. 清理前端、后端、SW 与 Rust 的旧依赖和构建产物
  2. 重新构建 Rust wasm（前端 bundler + 后端 nodejs）
  3. 重新安装前端、后端、SW 依赖
  4. 构建 SW
  5. 打包前端到根目录 static
  6. 可选启动后端服务

选项:
  --skip-clean             跳过清理步骤
  --start-backend          完成后启动后端
  --media-path <目录>      启动后端时使用的媒体目录
  -h, --help               查看帮助

示例:
  ./build-project.sh
  ./build-project.sh --start-backend --media-path /data/media
EOF
}

log() {
  printf '\n==> %s\n' "$1"
}

warn() {
  printf '警告: %s\n' "$1" >&2
}

die() {
  printf '错误: %s\n' "$1" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  local cmd="$1"
  command_exists "$cmd" || die "未找到命令: $cmd"
}

pick_package_manager() {
  local dir="$1"
  if [[ -f "$dir/yarn.lock" ]] && command_exists yarn; then
    echo "yarn"
  else
    echo "npm"
  fi
}

install_js_dependencies() {
  local dir="$1"
  local name="$2"
  local pm
  pm="$(pick_package_manager "$dir")"

  log "安装${name}依赖 (${pm})"
  if [[ "$pm" == "yarn" ]]; then
    (
      cd "$dir"
      yarn install --pure-lockfile
    )
  else
    (
      cd "$dir"
      npm install
    )
  fi
}

run_js_script() {
  local dir="$1"
  local script_name="$2"
  local name="$3"
  local pm
  pm="$(pick_package_manager "$dir")"

  log "执行${name}${script_name} (${pm})"
  if [[ "$pm" == "yarn" ]]; then
    (
      cd "$dir"
      yarn "$script_name"
    )
  else
    (
      cd "$dir"
      npm run "$script_name"
    )
  fi
}

resolve_existing_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || die "目录不存在: $dir"
  (
    cd "$dir"
    pwd
  )
}

validate_media_path() {
  [[ -n "$MEDIA_PATH" ]] || die "启用 --start-backend 时必须传入 --media-path"

  local abs_root
  local abs_media
  abs_root="$(resolve_existing_dir "$ROOT_DIR")"
  abs_media="$(resolve_existing_dir "$MEDIA_PATH")"

  if [[ "$abs_media" == "$abs_root" || "$abs_media" == "$abs_root"/* || "$abs_root" == "$abs_media"/* ]]; then
    die "媒体目录不能与项目目录互相包含"
  fi

  MEDIA_PATH="$abs_media"
}

get_wasm_bindgen_version() {
  awk '
    $0 == "name = \"wasm-bindgen\"" { found = 1; next }
    found && $1 == "version" {
      gsub(/"/, "", $3)
      print $3
      exit
    }
  ' "$RUST_DIR/Cargo.lock"
}

ensure_wasm_bindgen_cli() {
  local expected_version
  local current_version

  expected_version="$(get_wasm_bindgen_version)"
  [[ -n "$expected_version" ]] || die "无法从 Cargo.lock 解析 wasm-bindgen 版本"

  current_version="$(wasm-bindgen --version 2>/dev/null | awk '{print $2}' || true)"
  if [[ "$current_version" == "$expected_version" ]]; then
    return
  fi

  log "安装 wasm-bindgen-cli ${expected_version}"
  cargo install wasm-bindgen-cli --version "$expected_version" --locked
}

clean_projects() {
  log "清理旧依赖和构建产物"

  rm -rf "$ROOT_DIR/node_modules"
  rm -rf "$FRONTEND_DIR/node_modules"
  rm -rf "$SW_DIR/node_modules"
  rm -rf "$RUST_DIR/dist"
  rm -rf "$SW_DIR/dist"
  rm -rf "$STATIC_DIR"
  rm -rf "$FRONTEND_WASM_DIR"
  mkdir -p "$FRONTEND_WASM_DIR"

  (
    cd "$RUST_DIR"
    cargo clean
  )
}

prepare_environment() {
  if [[ -x "$HOME/.cargo/bin/rustc" && -x "$HOME/.cargo/bin/cargo" ]]; then
    export PATH="$HOME/.cargo/bin:$PATH"
    hash -r
  fi

  require_command node
  require_command npm
  require_command cargo
  require_command wasm-pack

  if command_exists rustup; then
    log "确保 Rust wasm target 已安装"
    rustup target add wasm32-unknown-unknown >/dev/null
  else
    warn "未检测到 rustup，如 wasm 构建失败请手动安装 wasm32-unknown-unknown target"
  fi

  ensure_wasm_bindgen_cli

  if ! command_exists ffmpeg || ! command_exists ffprobe; then
    warn "未检测到 ffmpeg/ffprobe，构建可继续，但后端运行相关功能可能受影响"
  fi
}

build_rust_wasm() {
  log "构建前端 wasm（bundler）"
  (
    cd "$RUST_DIR"
    wasm-pack build --target bundler --out-dir ./dist/bundler --out-name xxx
  )

  rm -rf "$FRONTEND_WASM_DIR"
  mkdir -p "$FRONTEND_WASM_DIR"
  cp -R "$RUST_DIR/dist/bundler/." "$FRONTEND_WASM_DIR/"

  log "构建后端 wasm（nodejs）"
  (
    cd "$RUST_DIR"
    wasm-pack build --target nodejs --out-dir ./dist/nodejs --out-name xxx
  )
}

start_backend() {
  validate_media_path
  log "启动后端服务"
  (
    cd "$ROOT_DIR"
    node server.js --path "$MEDIA_PATH"
  )
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-clean)
      SKIP_CLEAN=1
      shift
      ;;
    --start-backend)
      START_BACKEND=1
      shift
      ;;
    --media-path)
      [[ $# -ge 2 ]] || die "--media-path 需要一个目录参数"
      MEDIA_PATH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "未知参数: $1"
      ;;
  esac
done

prepare_environment

if [[ "$SKIP_CLEAN" -eq 0 ]]; then
  clean_projects
else
  log "跳过清理步骤"
fi

build_rust_wasm
install_js_dependencies "$ROOT_DIR" "后端"
install_js_dependencies "$FRONTEND_DIR" "前端"
install_js_dependencies "$SW_DIR" "SW"
run_js_script "$SW_DIR" "build" "SW "
run_js_script "$FRONTEND_DIR" "build" "前端 "

log "流程完成"
printf '前端打包产物: %s\n' "$STATIC_DIR"
printf '后端启动命令: node server.js --path <媒体目录>\n'

if [[ "$START_BACKEND" -eq 1 ]]; then
  start_backend
fi
