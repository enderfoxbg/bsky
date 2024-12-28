const { app, BrowserWindow, Tray, Menu, Notification, ipcMain } = require('electron')
const path = require('path')
const Store = require('electron-store')
const windowStateKeeper = require('electron-window-state')
const { autoUpdater } = require('electron-updater')

const store = new Store()
let tray = null
let mainWindow = null
let aboutWindow = null
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
  let mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800
  })

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    autoHideMenuBar: true,
    title: "Bluesky",
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: true,
      enableWebSQL: false,
      contextMenuEnabled: true
    }
  })
  mainWindowState.manage(mainWindow)
  mainWindow.loadURL('https://bsky.app')
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
      contextIsolation: true
    }
  })

  aboutWindow.loadFile('about.html')

  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
}

function checkForUpdates() {
    autoUpdater.logger = require("electron-log")
    autoUpdater.logger.transports.file.level = "info"
    
    // Force notification display
    autoUpdater.forceDevUpdateConfig = true
    
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

