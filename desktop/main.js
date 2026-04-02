require('dotenv').config();
const { app, BrowserWindow, globalShortcut, screen, clipboard, ipcMain, desktopCapturer } = require('electron');
const path = require('node:path');
const { exec } = require('child_process');

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';
  
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    kiosk: !isDev,
    alwaysOnTop: !isDev,
    fullscreen: !isDev,
    skipTaskbar: !isDev,
    frame: isDev,
    resizable: isDev,
    closable: isDev, // Prevent standard closing
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
      backgroundThrottling: false, // Ensure proctoring keeps running
      webSecurity: true,
    },
  });

  // Layer 6: Cross-Platform Anti-VM Detection
  ipcMain.handle('check-vm', async () => {
    return new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        const cmd = isWin 
            ? 'powershell "Get-WmiObject Win32_ComputerSystem | Select-Object -ExpandProperty Model"'
            : 'sysctl -n hw.model'; // MacOS model check

        exec(cmd, (err, stdout) => {
            const model = (stdout || '').toLowerCase();
            const vmKeywords = ['virtual', 'vmware', 'vbox', 'qemu', 'hyper-v', 'parallels', 'hv-1'];
            const isVM = vmKeywords.some(kw => model.includes(kw));
            resolve({ isVM, model: model.trim() });
        });
    });
  });

  // Prevent closing the app unless it's dev mode or programmatic exit
  mainWindow.on('close', (e) => {
    if (!isDev && !app.isQuitting) {
      e.preventDefault();
    }
  });

  // Layer 1: Content Protection (Invisible to screen recorders)
  if (!isDev) {
    mainWindow.setContentProtection(true);
  }

  const startUrl = process.env.APP_URL || 'http://localhost:3000/login'; 
  mainWindow.loadURL(startUrl);

  // Show window when ready to prevent flicker
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback show
  setTimeout(() => { if (mainWindow) mainWindow.show(); }, 3000);

  // Layer 2: Hardware Integrity (Monitor Check)
  ipcMain.handle('check-monitors', () => {
    const displays = screen.getAllDisplays();
    return {
      count: displays.length,
      isAllowed: displays.length === 1
    };
  });

  // Layer 4: Input & Clipboard Security
  ipcMain.on('clear-clipboard', () => {
    clipboard.clear();
  });

  // Layer 7: Programmatic Exit (Final submission)
  ipcMain.on('quit-app', () => {
    app.isQuitting = true;
    app.exit(0);
  });

  // Layer 7: Master Exit Shortcuts (Developer Only)
  const masterShortcuts = ['Alt+Shift+Q', 'Ctrl+Alt+Shift+Q'];
  masterShortcuts.forEach(s => {
    try {
      globalShortcut.register(s, () => {
         app.isQuitting = true;
         app.exit(0);
      });
    } catch (e) {
      console.warn(`Failed to register master exit: ${s}`);
    }
  });

  // Layer 1: Cross-Platform Process Blacklisting
  ipcMain.handle('check-processes', async () => {
    try {
        const psList = (await import('ps-list')).default;
        const processes = await psList();
        
        const blacklisted = [
            'anydesk', 'teamviewer', 'obs64', 'obs', 'discord', 'zoom', 
            'skype', 'slack', 'chrome'
        ].map(p => p.toLowerCase());

        const unauthorized = processes
            .filter(p => {
                const name = p.name.toLowerCase();
                // Core check: is it in the basic list?
                const isBlacklisted = blacklisted.some(b => name.includes(b));
                // Specialized check for Edge: only match the browser, not the runtime
                const isEdgeBrowser = (name.includes('msedge') || name.includes('microsoftedge')) && !name.includes('webview2');
                
                return isBlacklisted || isEdgeBrowser;
            })
            .map(p => p.name);

        // Layer 5: Network/VPN Check
        const os = require('os');
        const interfaces = os.networkInterfaces();
        const vpnKeywords = ['vpn', 'tun', 'tap', 'ppo', 'virtual', 'wireguard', 'tailscale'];
        const hasVPN = Object.keys(interfaces).some(name => 
            vpnKeywords.some(kw => name.toLowerCase().includes(kw))
        );

        if (hasVPN) unauthorized.push('VPN/Proxy tunnel detected');

        return { success: true, unauthorized };
    } catch (e) {
        console.error('Process check error:', e);
        return { success: false, unauthorized: [] };
    }
  });

  // New capture screen IPC
  ipcMain.handle('take-screenshot', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 800, height: 600 } });
    if (sources.length > 0) {
        return sources[0].thumbnail.toDataURL(); // Return base64 image
    }
    return null;
  });

  // Layer 4: Keyboard Lockdown
  if (!isDev) {
    app.on('browser-window-focus', () => {
      // Extensive functional lockdown: Block F-keys, Win, Control sequences, and functional escapes
      const functionalShortcuts = [
        'CommandOrControl+C', 'CommandOrControl+V', 'CommandOrControl+X', 'PrintScreen', 'Alt+Tab',
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'CommandOrControl+Shift+I', 'CommandOrControl+Shift+C', 'Alt+F4', 'CommandOrControl+N', 'CommandOrControl+T'
      ];
      functionalShortcuts.forEach(s => {
        try {
          globalShortcut.register(s, () => {
             console.log(`Forbidden Key Blocked: ${s}`);
             mainWindow.webContents.send('keyboard-violation', s);
          });
        } catch (e) {
          console.error(`Failed to register shortcut ${s}:`, e);
        }
      });
    });

    app.on('browser-window-blur', async () => {
      globalShortcut.unregisterAll();
      
      // Auto-capture on blur (Tab Switch / Alt+Tab)
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 800, height: 600 } });
      if (sources.length > 0) {
          const base64 = sources[0].thumbnail.toDataURL();
          mainWindow.webContents.send('electron-blur', base64);
      } else {
          mainWindow.webContents.send('electron-blur');
      }
    });
  }

  // Focus and instance handling
  mainWindow.focus();
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
