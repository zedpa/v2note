const { app, BrowserWindow, shell, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')

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
