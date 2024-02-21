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
import { BrowserWindow, app } from 'electron';
import { Request, Response } from 'express';
import { print, getPrinters } from 'unix-print';
import { print as windowPrint } from 'pdf-to-printer';
import { v4 as uuidv4 } from 'uuid';
import { getPrinters as windowGetPrinters } from 'win32-pdf-printer';

const os = require('os');

const isWindows = os.platform() === 'win32';

interface PrintRequest extends Request {
  file: Buffer;
}

const PORT = 53049;
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

let server: any = null;

const initialServer = (mainWindow: BrowserWindow | null) => {
  expressApp.get('/printers', (_req: any, res: any) => {
    mainWindow?.webContents.getPrintersAsync().then((printers: any) => {
      return res.json(printers);
    });
  });

  expressApp.post(
    '/print',
    upload.single('file'),
    async (req: PrintRequest, res: Response) => {
      const options = JSON.parse(req?.body?.options || '[]');
      const printer = req?.body?.printer;
      // if (!printer) return;
      const fileName = uuidv4();
      const tempPath = app.getPath('temp');

      const tmpFilePath = `${tempPath}${fileName}.pdf`;

      fs.writeFileSync(tmpFilePath, req.file.buffer, {
        encoding: 'binary',
      });

      try {
        if (isWindows) {
          const winPptions = {
            printer,
            paperSize: 'A4',
          };
          // eslint-disable-next-line promise/catch-or-return
          windowPrint(tmpFilePath, winPptions).then(() => {
            console.log('print success');
          });
        } else {
          print(tmpFilePath, printer, options)
            .then(() => {
              // TODO: cleanup file after print succeed
              console.log('print success');
              fs.unlink(tmpFilePath, (err: unknown) => {
                if (err) throw err;
                console.log(`${tmpFilePath} was deleted`);
              });
            })
            .catch((err) => {
              return res.sendStatus(500).send({ error: 'Something failed!' });
            });
        }
        return res.send(200);
      } catch (error) {
        console.log('err', error);
        return res.sendStatus(500).send({ error: 'Something failed!' });
      }
    },
  );

  if (isWindows) {
    const AllPrinterName = windowGetPrinters();
    console.log('🚀 ~ initialServer ~ AllPrinterName:', AllPrinterName);
  }

  server = expressApp.listen(PORT, () => {
    // run command if needed
    // execute('cd /tmp && mkdir otter-files');
    // const tempPath = app.getPath('temp');
    console.log(`Listening on ${PORT}`);
    // execute('lp /tmp/custom_58x40.pdf');
  });
};

export function shutDown() {
  console.log('Received kill signal. Shutting down gracefully...');
  server?.close(() => {
    console.log('Express server closed.');
    process.exit(0);
  });

  // If the server doesn't close within a certain time, forceful shutdown
  setTimeout(() => {
    console.error(
      'Could not close connections in time. Forcefully shutting down.',
    );
    process.exit(1);
  }, 5000); // 5 seconds
}

export default initialServer;
