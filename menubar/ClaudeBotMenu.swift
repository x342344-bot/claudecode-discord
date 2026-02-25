import Cocoa
import ObjectiveC

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var timer: Timer?
    private let label = "com.claude-discord"
    private var botDir: String
    private var plistDst: String
    private var envPath: String
    private var currentVersion: String = "unknown"
    private var updateAvailable: Bool = false

    override init() {
        let scriptDir = (CommandLine.arguments[0] as NSString).deletingLastPathComponent
        botDir = (scriptDir as NSString).deletingLastPathComponent
        plistDst = NSHomeDirectory() + "/Library/LaunchAgents/com.claude-discord.plist"
        envPath = botDir + "/.env"
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        currentVersion = getVersion()
        checkForUpdates()
        updateStatus()
        buildMenu()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.updateStatus()
            self?.buildMenu()
        }
        // Check for updates every 5 minutes
        Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            self?.checkForUpdates()
        }

        // .env 없으면 자동으로 설정 창 열기
        if !FileManager.default.fileExists(atPath: envPath) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.openSettings()
            }
        }
    }

    private func getVersion() -> String {
        let output = runShell("cd '\(botDir)' && git describe --tags --always 2>/dev/null")
        let ver = output.trimmingCharacters(in: .whitespacesAndNewlines)
        return ver.isEmpty ? "unknown" : ver
    }

    private func checkForUpdates() {
        DispatchQueue.global(qos: .background).async {
            self.runShell("cd '\(self.botDir)' && git fetch origin main 2>/dev/null")
            let local = self.runShell("cd '\(self.botDir)' && git rev-parse HEAD 2>/dev/null").trimmingCharacters(in: .whitespacesAndNewlines)
            let remote = self.runShell("cd '\(self.botDir)' && git rev-parse origin/main 2>/dev/null").trimmingCharacters(in: .whitespacesAndNewlines)
            let hasUpdate = !local.isEmpty && !remote.isEmpty && local != remote
            DispatchQueue.main.async {
                self.updateAvailable = hasUpdate
                self.buildMenu()
            }
        }
    }

    @objc private func performUpdate() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Update Available"
        alert.informativeText = "Do you want to update to the latest version? The bot will restart after updating."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Update")
        alert.addButton(withTitle: "Cancel")

        if alert.runModal() == .alertFirstButtonReturn {
            let wasRunning = isRunning()
            if wasRunning {
                runShell("launchctl unload '\(plistDst)' 2>/dev/null")
            }

            let output = runShell("cd '\(botDir)' && git pull origin main && npm install --production && npm run build 2>&1")

            currentVersion = getVersion()
            updateAvailable = false

            if wasRunning {
                let plistSrc = "\(botDir)/com.claude-discord.plist"
                runShell("cp '\(plistSrc)' '\(plistDst)' && launchctl load '\(plistDst)'")
            }

            let doneAlert = NSAlert()
            doneAlert.messageText = "Update Complete"
            doneAlert.informativeText = "Updated to version: \(currentVersion)\n\n\(output)"
            doneAlert.alertStyle = .informational
            doneAlert.runModal()

            updateStatus()
            buildMenu()
        }
    }

    private func isRunning() -> Bool {
        return FileManager.default.fileExists(atPath: botDir + "/.bot.lock")
    }

    private func updateStatus() {
        let running = isRunning()
        let hasEnv = FileManager.default.fileExists(atPath: envPath)
        DispatchQueue.main.async {
            if !hasEnv {
                self.statusItem.button?.title = " ⚙️"
                self.statusItem.button?.toolTip = "Claude Bot: Setup Required"
            } else {
                self.statusItem.button?.title = running ? " 🟢" : " 🔴"
                self.statusItem.button?.toolTip = running ? "Claude Bot: Running" : "Claude Bot: Stopped"
            }
        }
    }

    private func buildMenu() {
        let menu = NSMenu()
        let running = isRunning()
        let hasEnv = FileManager.default.fileExists(atPath: envPath)

        if !hasEnv {
            let noEnvItem = NSMenuItem(title: "⚙️ Setup Required", action: nil, keyEquivalent: "")
            noEnvItem.isEnabled = false
            menu.addItem(noEnvItem)
            menu.addItem(NSMenuItem.separator())

            let setupItem = NSMenuItem(title: "Setup...", action: #selector(openSettings), keyEquivalent: "e")
            setupItem.target = self
            menu.addItem(setupItem)
        } else {
            let statusItem = NSMenuItem(title: running ? "🟢 Running" : "🔴 Stopped", action: nil, keyEquivalent: "")
            statusItem.isEnabled = false
            menu.addItem(statusItem)
            menu.addItem(NSMenuItem.separator())

            if running {
                let stopItem = NSMenuItem(title: "Stop Bot", action: #selector(stopBot), keyEquivalent: "s")
                stopItem.target = self
                menu.addItem(stopItem)

                let restartItem = NSMenuItem(title: "Restart Bot", action: #selector(restartBot), keyEquivalent: "r")
                restartItem.target = self
                menu.addItem(restartItem)
            } else {
                let startItem = NSMenuItem(title: "Start Bot", action: #selector(startBot), keyEquivalent: "s")
                startItem.target = self
                menu.addItem(startItem)
            }

            menu.addItem(NSMenuItem.separator())

            let settingsItem = NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: "e")
            settingsItem.target = self
            menu.addItem(settingsItem)

            let logItem = NSMenuItem(title: "View Log", action: #selector(openLog), keyEquivalent: "l")
            logItem.target = self
            menu.addItem(logItem)

            let folderItem = NSMenuItem(title: "Open Folder", action: #selector(openFolder), keyEquivalent: "f")
            folderItem.target = self
            menu.addItem(folderItem)
        }

        menu.addItem(NSMenuItem.separator())

        // Auto-start toggle
        let autoStartItem = NSMenuItem(title: "Start at Login", action: #selector(toggleAutoStart), keyEquivalent: "")
        autoStartItem.target = self
        autoStartItem.state = FileManager.default.fileExists(atPath: plistDst) ? .on : .off
        menu.addItem(autoStartItem)

        // Version & update
        let versionItem = NSMenuItem(title: "Version: \(currentVersion)", action: nil, keyEquivalent: "")
        versionItem.isEnabled = false
        menu.addItem(versionItem)

        if updateAvailable {
            let updateItem = NSMenuItem(title: "⬆️ Update Available", action: #selector(performUpdate), keyEquivalent: "u")
            updateItem.target = self
            menu.addItem(updateItem)
        }

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(quitAll), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        self.statusItem.menu = menu
    }

    // MARK: - Settings Window

    private func loadEnv() -> [String: String] {
        guard let content = try? String(contentsOfFile: envPath, encoding: .utf8) else { return [:] }
        var env: [String: String] = [:]
        for line in content.split(separator: "\n") {
            let str = String(line).trimmingCharacters(in: .whitespaces)
            if str.hasPrefix("#") || !str.contains("=") { continue }
            let parts = str.split(separator: "=", maxSplits: 1)
            let key = String(parts[0])
            let value = parts.count > 1 ? String(parts[1]) : ""
            env[key] = value
        }
        return env
    }

    @objc private func openSettings() {
        NSApp.activate(ignoringOtherApps: true)

        let env = loadEnv()

        let alert = NSAlert()
        alert.messageText = "Claude Discord Bot Settings"
        alert.informativeText = "Please fill in the required fields.\nSetup guide: https://github.com/chadingTV/claudecode-discord/blob/main/SETUP.md"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")

        let width: CGFloat = 400
        let fieldHeight: CGFloat = 24
        let labelHeight: CGFloat = 18
        let spacing: CGFloat = 8
        let browseButtonWidth: CGFloat = 80
        let fields: [(label: String, key: String, placeholder: String, defaultValue: String)] = [
            ("Discord Bot Token:", "DISCORD_BOT_TOKEN", "Enter bot token", ""),
            ("Discord Guild ID:", "DISCORD_GUILD_ID", "Enter server ID", ""),
            ("Allowed User IDs (comma-separated):", "ALLOWED_USER_IDS", "123456789,987654321", ""),
            ("Base Project Directory:", "BASE_PROJECT_DIR", botDir, botDir),
            ("Rate Limit Per Minute:", "RATE_LIMIT_PER_MINUTE", "10", "10"),
            ("Show Cost (true/false):", "SHOW_COST", "false recommended for Max plan", "true"),
        ]

        // Setup guide link + fields height
        let linkHeight: CGFloat = 20
        let totalHeight = linkHeight + spacing + CGFloat(fields.count) * (labelHeight + fieldHeight + spacing) + 4
        let accessory = NSView(frame: NSRect(x: 0, y: 0, width: width, height: totalHeight))

        var textFields: [String: NSTextField] = [:]
        var y = totalHeight

        // Clickable setup guide link
        y -= linkHeight
        let linkButton = NSButton(frame: NSRect(x: 0, y: y, width: width, height: linkHeight))
        linkButton.title = "📖 Open Setup Guide"
        linkButton.bezelStyle = .inline
        linkButton.isBordered = false
        linkButton.font = NSFont.systemFont(ofSize: 12)
        linkButton.contentTintColor = .linkColor
        linkButton.target = self
        linkButton.action = #selector(openSetupGuide)
        accessory.addSubview(linkButton)
        y -= spacing

        for field in fields {
            y -= labelHeight
            let label = NSTextField(labelWithString: field.label)
            label.frame = NSRect(x: 0, y: y, width: width, height: labelHeight)
            label.font = NSFont.systemFont(ofSize: 12, weight: .medium)
            accessory.addSubview(label)

            y -= fieldHeight
            if field.key == "BASE_PROJECT_DIR" {
                // Text field + Browse button
                let input = NSTextField(frame: NSRect(x: 0, y: y, width: width - browseButtonWidth - 4, height: fieldHeight))
                input.placeholderString = field.placeholder
                input.stringValue = env[field.key] ?? field.defaultValue
                accessory.addSubview(input)
                textFields[field.key] = input

                let browseBtn = NSButton(frame: NSRect(x: width - browseButtonWidth, y: y, width: browseButtonWidth, height: fieldHeight))
                browseBtn.title = "Browse..."
                browseBtn.bezelStyle = .rounded
                browseBtn.target = self
                browseBtn.action = #selector(browseFolderClicked(_:))
                browseBtn.tag = Int(input.hash)
                accessory.addSubview(browseBtn)
                // Store reference for browse callback
                objc_setAssociatedObject(browseBtn, "targetField", input, .OBJC_ASSOCIATION_RETAIN)
            } else {
                let input = NSTextField(frame: NSRect(x: 0, y: y, width: width, height: fieldHeight))
                input.placeholderString = field.placeholder
                input.stringValue = env[field.key] ?? field.defaultValue
                if field.key == "DISCORD_BOT_TOKEN" {
                    let val = env[field.key] ?? ""
                    if val.count > 10 {
                        input.placeholderString = "••••" + String(val.suffix(6)) + " (enter full token to change)"
                        input.stringValue = ""
                    }
                }
                accessory.addSubview(input)
                textFields[field.key] = input
            }

            y -= spacing
        }

        alert.accessoryView = accessory

        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            // 저장
            var newEnv: [String: String] = [:]
            for field in fields {
                let value = textFields[field.key]?.stringValue ?? ""
                if field.key == "DISCORD_BOT_TOKEN" && value.isEmpty {
                    // 빈칸이면 기존 값 유지
                    newEnv[field.key] = env[field.key] ?? ""
                } else if value.isEmpty {
                    newEnv[field.key] = field.defaultValue
                } else {
                    newEnv[field.key] = value
                }
            }

            // 필수 체크
            if (newEnv["DISCORD_BOT_TOKEN"] ?? "").isEmpty ||
               (newEnv["DISCORD_GUILD_ID"] ?? "").isEmpty ||
               (newEnv["ALLOWED_USER_IDS"] ?? "").isEmpty {
                let errAlert = NSAlert()
                errAlert.messageText = "Required Fields Missing"
                errAlert.informativeText = "Bot Token, Guild ID, and User IDs are required."
                errAlert.alertStyle = .warning
                errAlert.runModal()
                return
            }

            // .env 파일 쓰기
            var content = ""
            for field in fields {
                if field.key == "SHOW_COST" {
                    content += "# Show estimated API cost in task results (set false for Max plan users)\n"
                }
                content += "\(field.key)=\(newEnv[field.key] ?? "")\n"
            }
            try? content.write(toFile: envPath, atomically: true, encoding: .utf8)

            updateStatus()
            buildMenu()
        }
    }

    @objc private func openSetupGuide() {
        NSWorkspace.shared.open(URL(string: "https://github.com/chadingTV/claudecode-discord/blob/main/SETUP.md")!)
    }

    @objc private func browseFolderClicked(_ sender: NSButton) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Select"
        panel.message = "Select Base Project Directory"
        if panel.runModal() == .OK, let url = panel.url {
            if let field = objc_getAssociatedObject(sender, "targetField") as? NSTextField {
                field.stringValue = url.path
            }
        }
    }

    @objc private func toggleAutoStart() {
        let plistSrc = "\(botDir)/com.claude-discord.plist"
        if FileManager.default.fileExists(atPath: plistDst) {
            // Disable auto-start
            runShell("launchctl unload '\(plistDst)' 2>/dev/null")
            try? FileManager.default.removeItem(atPath: plistDst)
        } else {
            // Enable auto-start
            runShell("cp '\(plistSrc)' '\(plistDst)' && launchctl load '\(plistDst)'")
        }
        buildMenu()
    }

    // MARK: - Bot Controls

    @objc private func startBot() {
        let plistSrc = "\(botDir)/com.claude-discord.plist"
        runShell("cp '\(plistSrc)' '\(plistDst)' && launchctl load '\(plistDst)'")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            self.updateStatus()
            self.buildMenu()
        }
    }

    @objc private func stopBot() {
        runShell("launchctl unload '\(plistDst)' 2>/dev/null")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            self.updateStatus()
            self.buildMenu()
        }
    }

    @objc private func restartBot() {
        runShell("launchctl unload '\(plistDst)' 2>/dev/null")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            let plistSrc = "\(self.botDir)/com.claude-discord.plist"
            self.runShell("cp '\(plistSrc)' '\(self.plistDst)' && launchctl load '\(self.plistDst)'")
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self.updateStatus()
                self.buildMenu()
            }
        }
    }

    @objc private func openLog() {
        NSWorkspace.shared.open(URL(fileURLWithPath: "\(botDir)/bot.log"))
    }

    @objc private func openFolder() {
        NSWorkspace.shared.open(URL(fileURLWithPath: botDir))
    }

    @objc private func quitAll() {
        if isRunning() {
            runShell("launchctl unload '\(plistDst)' 2>/dev/null")
        }
        NSApplication.shared.terminate(nil)
    }

    @discardableResult
    private func runShell(_ command: String) -> String {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["-c", command]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe
        try? task.run()
        task.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8) ?? ""
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
