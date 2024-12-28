process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true
process.env.ELECTRON_ENABLE_LOGGING = false

const { app, BrowserWindow, Tray, Menu, Notification, ipcMain } = require('electron')
if (!app.isPackaged) {
    process.stdout.write = () => {}
    process.stderr.write = () => {}
}

const path = require('path')
const Store = require('electron-store')
const windowStateKeeper = require('electron-window-state')
const { autoUpdater } = require('electron-updater')

const store = new Store()
let tray = null
let mainWindow = null
let aboutWindow = null
let updateWindow = null
if (store.get('minimizeToTray') === undefined) {
  store.set('minimizeToTray', true)
}
if (store.get('enableNotifications') === undefined) {
  store.set('enableNotifications', true)
}

function minimizeNotification() {
  if (Notification.isSupported()) {
    new Notification({
      title: 'Bluesky',
      body: 'App is still running in the system tray. Right-click the tray icon to quit.',
      icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
    }).show()
  }
}

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 720
  })

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    autoHideMenuBar: true,
    title: 'Loading — Bluesky',
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://bsky.app/static/media/InterVariable*.woff2'] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'font',
          'Sec-Fetch-Site': 'same-origin',
          'credentials': 'omit',
          'mode': 'cors'
        }
      })
    }
  )
  if (process.platform === 'linux') {
    app.on('ready', () => {
      process.env.XDG_CURRENT_DESKTOP = 'Unity'
    })
  }

  mainWindow.loadURL('https://bsky.app')
  mainWindowState.manage(mainWindow)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      body {
        --sb-thumb-color: #1184ff;
        --sb-size: 7px;
      }

      body::-webkit-scrollbar {
        width: var(--sb-size);
      }

      body::-webkit-scrollbar-track {
        border-radius: 7px;
      }

      body::-webkit-scrollbar-thumb {
        background: var(--sb-thumb-color);
        border-radius: 7px;
        border: 1px solid #232E33;
      }

      @supports not selector(::-webkit-scrollbar) {
        body {
          scrollbar-color: var(--sb-thumb-color);
        }
      }
    `)
  })

  mainWindow.webContents.insertCSS(`
    @keyframes correction {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.1); }
      100% { opacity: 1; transform: scale(1); }
    }
  `)
  mainWindow.on('close', function (event) {
    if (!app.isQuitting && store.get('minimizeToTray')) {
      event.preventDefault()
      mainWindow.hide()
      minimizeNotification()
    }
    return false
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createTray() {
  const iconPath = path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  tray = new Tray(iconPath)
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open/Close Bsky',
      click: () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
      }
    },
    {
      label: 'Reload',
      click: () => {
        mainWindow.reload()
      }
    },
    { type: 'separator' },
    {
      label: 'Minimize to Tray on Close',
      type: 'checkbox',
      checked: store.get('minimizeToTray'),
      click: (menuItem) => {
        store.set('minimizeToTray', menuItem.checked)
      }
    },
    {
      label: 'Enable Notifications',
      type: 'checkbox',
      checked: store.get('enableNotifications'),
      click: (menuItem) => {
        store.set('enableNotifications', menuItem.checked)
      }
    },
    { type: 'separator' },
    {
      label: 'About',
      click: () => {
        if (!aboutWindow) {
          createAboutWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => {
        if (!updateWindow) {
          createUpdateWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('Bluesky')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })
}

function createAboutWindow() {
  aboutWindow = new BrowserWindow({
    width: 500,
    height: 400,
    autoHideMenuBar: true,
    parent: mainWindow,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  aboutWindow.loadFile('about.html')

  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
}

function createUpdateWindow() {
    updateWindow = new BrowserWindow({
        width: 400,
        height: 300,
        autoHideMenuBar: true,
        parent: mainWindow,
        modal: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    })

    updateWindow.loadFile('update.html')
    mainWindow.on('close', () => {
        if (updateWindow) {
            updateWindow.close()
        }
    })

    updateWindow.on('closed', () => {
        updateWindow = null
    })
}

function checkForUpdates() {
    if (app.isPackaged) {
        autoUpdater.on('update-available', (info) => {
            if (store.get('enableNotifications')) {
                new Notification({
                    title: 'Update Available',
                    body: `Version ${info.version} is available. Downloading...`,
                    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
                }).show()
            }
        })
      
        autoUpdater.on('update-downloaded', (info) => {
            if (store.get('enableNotifications')) {
                new Notification({
                    title: 'Update Ready',
                    body: `Version ${info.version} will be installed on restart`,
                    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
                }).show()
            }
            
            setTimeout(() => {
                autoUpdater.quitAndInstall()
            }, 5000)
        })
      
        autoUpdater.checkForUpdatesAndNotify()
    }
}

if (process.platform === 'darwin') {
  app.dock.setIcon(path.join(__dirname, 'icons', 'icon.png'))
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  checkForUpdates()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('show-notification', (_, { title, body }) => {
  if (store.get('enableNotifications') && Notification.isSupported()) {
    new Notification({
      title,
      body,
      icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
    }).show()
  }
})

ipcMain.handle('get-current-version', () => {
    return app.getVersion()
})

ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) return { updateAvailable: false }
    
    try {
        const result = await autoUpdater.checkForUpdates()
        return {
            updateAvailable: result?.updateInfo?.version !== app.getVersion(),
            version: result?.updateInfo?.version
        }
    } catch (error) {
        return { updateAvailable: false, error: error.message }
    }
})

ipcMain.handle('start-update', () => {
    if (store.get('enableNotifications')) {
        new Notification({
            title: 'Updating Bluesky Desktop',
            body: 'The app will restart when the update is ready.',
            icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
        }).show()
    }
    autoUpdater.quitAndInstall()
})
