#!/bin/bash
# Claude Discord Bot - Auto-update & Start Script
# 사용법:
#   ./mac-start.sh          → 백그라운드 실행 (launchd 등록)
#   ./mac-start.sh --fg     → 포그라운드 실행 (디버깅용)
#   ./mac-start.sh --stop   → 중지
#   ./mac-start.sh --status → 상태 확인

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

PLIST_NAME="com.claude-discord.plist"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"
LABEL="com.claude-discord"
MENUBAR="$SCRIPT_DIR/menubar/ClaudeBotMenu"

# --stop: 중지
if [ "$1" = "--stop" ]; then
    if launchctl list | grep -q "$LABEL"; then
        launchctl unload "$PLIST_DST" 2>/dev/null
        echo "🔴 봇 중지됨"
    else
        echo "봇이 실행 중이 아닙니다"
    fi
    # 메뉴바 앱도 종료
    pkill -f "ClaudeBotMenu" 2>/dev/null
    exit 0
fi

# --status: 상태 확인
if [ "$1" = "--status" ]; then
    if launchctl list | grep -q "$LABEL"; then
        PID=$(launchctl list | grep "$LABEL" | awk '{print $1}')
        echo "🟢 봇 실행 중 (PID: $PID)"
    else
        echo "🔴 봇 중지됨"
    fi
    exit 0
fi

# --fg: 포그라운드 실행 (launchd 없이 직접 실행)
if [ "$1" = "--fg" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
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
    exec node dist/index.js
fi

# 기본: 백그라운드 실행 (launchd 등록)
if [ ! -f "$PLIST_SRC" ]; then
    echo "❌ $PLIST_NAME 파일을 찾을 수 없습니다"
    exit 1
fi

# 이미 실행 중이면 종료 후 재시작
if launchctl list | grep -q "$LABEL"; then
    echo "🔄 기존 봇 종료 중..."
    launchctl unload "$PLIST_DST" 2>/dev/null
    sleep 1
fi

# 메뉴바 앱 컴파일 (바이너리 없으면)
if [ ! -f "$MENUBAR" ] && [ -f "$SCRIPT_DIR/menubar/ClaudeBotMenu.swift" ]; then
    echo "🔨 메뉴바 앱 빌드 중..."
    swiftc -o "$MENUBAR" "$SCRIPT_DIR/menubar/ClaudeBotMenu.swift" -framework Cocoa 2>/dev/null
fi

# 메뉴바 앱 먼저 실행 (설정이 없으면 트레이에서 설정하도록)
if [ -f "$MENUBAR" ]; then
    pkill -f "ClaudeBotMenu" 2>/dev/null
    nohup "$MENUBAR" > /dev/null 2>&1 &
fi

# .env 있으면 봇 시작, 없으면 트레이에서 설정하도록
if [ -f "$ENV_FILE" ]; then
    cp "$PLIST_SRC" "$PLIST_DST"
    launchctl load "$PLIST_DST"
    if [ -f "$MENUBAR" ]; then
        echo "🟢 봇이 백그라운드에서 시작되었습니다 (메뉴바 표시)"
    else
        echo "🟢 봇이 백그라운드에서 시작되었습니다"
    fi
else
    echo "⚙️ .env not found. Please configure settings from the menu bar icon."
fi
echo "   중지: ./mac-start.sh --stop"
echo "   상태: ./mac-start.sh --status"
echo "   로그: tail -f bot.log"
