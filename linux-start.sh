#!/bin/bash
# Claude Discord Bot - Linux Auto-update & Start Script
# 사용법:
#   ./linux-start.sh          → 백그라운드 실행 (systemd 등록)
#   ./linux-start.sh --fg     → 포그라운드 실행 (디버깅용)
#   ./linux-start.sh --stop   → 중지
#   ./linux-start.sh --status → 상태 확인

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
SERVICE_NAME="claude-discord"
SERVICE_FILE="$HOME/.config/systemd/user/$SERVICE_NAME.service"

# node 경로 찾기
find_node() {
    # nvm
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        . "$HOME/.nvm/nvm.sh"
        which node 2>/dev/null && return
    fi
    # fnm
    if command -v fnm &>/dev/null; then
        eval "$(fnm env)" 2>/dev/null
        which node 2>/dev/null && return
    fi
    # system
    which node 2>/dev/null
}

NODE_BIN=$(find_node)
if [ -z "$NODE_BIN" ]; then
    echo "❌ Node.js를 찾을 수 없습니다"
    exit 1
fi

# --stop: 중지
if [ "$1" = "--stop" ]; then
    systemctl --user stop "$SERVICE_NAME" 2>/dev/null
    echo "🔴 봇 중지됨"
    # 트레이 앱도 종료
    pkill -f "claude_tray.py" 2>/dev/null
    exit 0
fi

# --status: 상태 확인
if [ "$1" = "--status" ]; then
    if systemctl --user is-active "$SERVICE_NAME" &>/dev/null; then
        echo "🟢 봇 실행 중"
        systemctl --user status "$SERVICE_NAME" --no-pager -l 2>/dev/null | head -5
    else
        echo "🔴 봇 중지됨"
    fi
    exit 0
fi

# --fg: 포그라운드 실행
if [ "$1" = "--fg" ]; then
    # nvm 환경 로드
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        export NVM_DIR="$HOME/.nvm"
        . "$NVM_DIR/nvm.sh"
    fi
    cd "$SCRIPT_DIR"

    VERSION=$(git describe --tags --always 2>/dev/null || echo "unknown")
    echo "[claude-bot] 현재 버전: $VERSION"
    echo "[claude-bot] Git 업데이트 확인 중..."
    git fetch origin main 2>/dev/null
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse origin/main 2>/dev/null)

    if [ -n "$LOCAL" ] && [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
        echo "[claude-bot] 업데이트가 있습니다 (메뉴바/트레이에서 업데이트 가능)"
    else
        echo "[claude-bot] 최신 버전입니다"
    fi

    if [ ! -d "dist" ]; then
        echo "[claude-bot] 빌드 파일 없음, 빌드 중..."
        npm run build
    fi

    echo "[claude-bot] 봇 시작 (포그라운드)..."
    touch "$SCRIPT_DIR/.bot.lock"
    trap 'rm -f "$SCRIPT_DIR/.bot.lock"' EXIT
    exec "$NODE_BIN" dist/index.js
fi

# 기본: 백그라운드 실행 (systemd 등록)

# systemd user 디렉토리 생성
mkdir -p "$HOME/.config/systemd/user"

# 이미 실행 중이면 종료 후 재시작
if systemctl --user is-active "$SERVICE_NAME" &>/dev/null; then
    echo "🔄 기존 봇 종료 중..."
    systemctl --user stop "$SERVICE_NAME"
    sleep 1
fi

# systemd 서비스 파일 생성
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Claude Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$SCRIPT_DIR
ExecStart=/bin/bash $SCRIPT_DIR/linux-start.sh --fg
Restart=always
RestartSec=10
StandardOutput=append:$SCRIPT_DIR/bot.log
StandardError=append:$SCRIPT_DIR/bot-error.log

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload

# 트레이 앱 먼저 실행 (설정이 없으면 트레이에서 설정하도록)
TRAY_SCRIPT="$SCRIPT_DIR/tray/claude_tray.py"
if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    if [ -f "$TRAY_SCRIPT" ] && command -v python3 &>/dev/null; then
        # pystray + Pillow 설치 확인 및 자동 설치
        if ! python3 -c "import pystray; from PIL import Image" 2>/dev/null; then
            echo "📦 트레이 앱 의존성 설치 중..."
            pip3 install pystray Pillow 2>/dev/null || pip install pystray Pillow 2>/dev/null
        fi
        # AppIndicator + tkinter 시스템 패키지 확인 (Ubuntu/Pop!_OS/Debian)
        NEED_APT=""
        if ! python3 -c "import gi; gi.require_version('AyatanaAppIndicator3', '0.1')" 2>/dev/null && \
           ! python3 -c "import gi; gi.require_version('AppIndicator3', '0.1')" 2>/dev/null; then
            NEED_APT="gir1.2-ayatanaappindicator3-0.1"
        fi
        if ! python3 -c "import tkinter" 2>/dev/null; then
            NEED_APT="$NEED_APT python3-tk"
        fi
        if [ -n "$NEED_APT" ]; then
            echo "📦 시스템 트레이 라이브러리 설치 중..."
            sudo apt install -y $NEED_APT 2>/dev/null || true
        fi
        if python3 -c "import pystray; from PIL import Image" 2>/dev/null; then
            pkill -f "claude_tray.py" 2>/dev/null
            nohup python3 "$TRAY_SCRIPT" > /dev/null 2>&1 &
        fi
    fi
fi

# .env 있으면 봇 시작, 없으면 트레이에서 설정하도록
if [ -f "$ENV_FILE" ]; then
    systemctl --user enable "$SERVICE_NAME" 2>/dev/null
    systemctl --user start "$SERVICE_NAME"
    echo "🟢 봇이 백그라운드에서 시작되었습니다"
else
    echo "⚙️ .env not found. Please configure settings from the tray icon."
fi
echo "   중지: ./linux-start.sh --stop"
echo "   상태: ./linux-start.sh --status"
echo "   로그: tail -f bot.log"
