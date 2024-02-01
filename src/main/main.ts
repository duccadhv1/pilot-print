/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  shell,
  nativeImage,
} from 'electron';
import path from 'path';
import { print } from 'unix-print';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

const { exec } = require('child_process');

function execute(command: string, callback?: Function) {
  exec(command, (error: any, stdout: any) => {
    if (callback) callback(stdout);
  });
}

interface PrintRequest extends Request {
  file: Buffer;
}

const os = require('os');

const PORT = 3001;
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const expressApp = express();
const bodyParser = require('body-parser');

expressApp.use(cors());
expressApp.use(bodyParser.json());

expressApp.use(bodyParser.json({ extended: true }));

const multer = require('multer');

const upload = multer();

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('electron-fiddle', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('electron-fiddle');
}
let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  const image = nativeImage.createFromPath(getAssetPath('icon.png'));
  app.dock.setIcon(image);

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }

    expressApp.get('/pdf', (_req: any, res: any) => {
      fs.readFile(
        path.join(__dirname, '../../assets/label.pdf'),
        (_err: any, _data: any) => {
          res.contentType('application/pdf');
          res.json();
        },
      );
    });

    expressApp.get('/printers', (_req: any, res: any) => {
      mainWindow?.webContents.getPrintersAsync().then((printers: any) => {
        return res.json(printers);
      });
    });

    expressApp.post(
      '/print/:printer',
      upload.single('file'),
      async (req: PrintRequest, res: Response) => {
        const options = req?.body?.options;
        const { printer } = req.params;
        const fileName = uuidv4();

        const tmpFilePath = `/tmp/otter-files/${fileName}.pdf`;

        fs.writeFileSync(tmpFilePath, req.file.buffer, {
          encoding: 'binary',
        });

        // eslint-disable-next-line promise/catch-or-return
        print(tmpFilePath, printer, options)
          .then(() => {
            // TODO: cleanup file after print succeed
            console.log('print success');
          })
          .catch((err) => {
            return res.sendStatus(500).send({ error: 'Something failed!' });
          });
        return res.send(200);
      },
    );

    expressApp.listen(PORT, () => {
      // run command if needed
      execute('cd /tmp && mkdir otter-files');
      console.log('Listening on 3000');
      // execute('lp /tmp/custom_58x40.pdf');
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  // new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('getPrinters', () => {
  return mainWindow?.webContents.getPrintersAsync();
});

ipcMain.on('shell:open', () => {
  const pageDirectory = __dirname.replace('app.asar', 'app.asar.unpacked');
  const pagePath = path.join('file://', pageDirectory, 'index.html');
  shell.openExternal(pagePath);
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine, _workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Create mainWindow, load the rest of the app, etc...

  app
    .whenReady()
    .then(() => {
      createWindow();
      app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) createWindow();
      });
    })
    .catch(console.log);

  app.on('open-url', (event, url) => {
    dialog.showErrorBox('Welcome Back', `You arrived from: ${url}`);
  });
}
