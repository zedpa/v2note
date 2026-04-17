const { app, BrowserWindow, shell, protocol, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')

// Auto-update (仅 production 生效)
let autoUpdater
try {
  autoUpdater = require('electron-updater').autoUpdater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
} catch {
  // electron-updater 未安装（开发模式），跳过
  autoUpdater = null
}

// Static export dir
const STATIC_DIR = path.join(__dirname, '..', 'out')

let mainWindow
let server
let actualPort

// Simple static file server for the Next.js export
function startStaticServer() {
  return new Promise((resolve) => {
    const MIME = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.map': 'application/json',
      '.txt': 'text/plain',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
    }

    server = http.createServer((req, res) => {
      let url = decodeURIComponent(req.url.split('?')[0])

      // Try exact file first, then .html, then /index.html
      let filePath = path.join(STATIC_DIR, url)
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        // Try appending .html
        const htmlPath = path.join(STATIC_DIR, url + '.html')
        const indexPath = path.join(STATIC_DIR, url, 'index.html')
        if (fs.existsSync(htmlPath)) {
          filePath = htmlPath
        } else if (fs.existsSync(indexPath)) {
          filePath = indexPath
        } else {
          // Fallback to index.html for SPA routing
          filePath = path.join(STATIC_DIR, 'index.html')
        }
      }

      const ext = path.extname(filePath)
      const contentType = MIME[ext] || 'application/octet-stream'

      try {
        const content = fs.readFileSync(filePath)
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    // Port 0 = OS picks a free port
    server.listen(0, '127.0.0.1', () => {
      actualPort = server.address().port
      console.log(`[v2note] Static server on http://127.0.0.1:${actualPort}`)
      resolve()
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '念念有路',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#FAF6F0', // cream
    show: false,
  })

  // Load via local HTTP so Next.js routing works normally
  mainWindow.loadURL(`http://127.0.0.1:${actualPort}/write`)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes(`127.0.0.1:${PORT}`)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await startStaticServer()
  createWindow()

  // 启动自动更新检查
  if (autoUpdater) {
    autoUpdater.on('update-available', () => {
      console.log('[updater] Update available, downloading...')
    })
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '更新就绪',
        message: '新版本已下载完成，重启应用即可更新。',
        buttons: ['稍后', '立即重启'],
        defaultId: 1,
      }).then(({ response }) => {
        if (response === 1) {
          autoUpdater.quitAndInstall()
        }
      })
    })
    autoUpdater.on('error', (err) => {
      console.error('[updater] Error:', err.message)
    })
    // 延迟 5 秒后检查更新，避免启动时卡顿
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5000)
  }
})

app.on('window-all-closed', () => {
  if (server) server.close()
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
