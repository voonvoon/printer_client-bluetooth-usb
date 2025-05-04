const { app, BrowserWindow, powerSaveBlocker } = require("electron");
const log = require("electron-log"); // Import electron-log
const path = require("path");
const fs = require("fs");

// Configure electron-log to save logs in the same directory as main.js
log.transports.file.resolvePath = () => path.join(__dirname, "main.log");

// Start the power save blocker
let blockerId = powerSaveBlocker.start("prevent-app-suspension");
log.info("Power save blocker started:", powerSaveBlocker.isStarted(blockerId));

// Capture console.log from client_blutooth.js
const originalConsoleLog = console.log;
console.log = function (...args) {
  originalConsoleLog(...args); // Log to the main process console
  log.info(...args); // Log to electron-log
  const message = args.join(" ");
  if (mainWindow) {
    mainWindow.webContents.send("log", message); // Send log to the renderer process
  }
};

// Require the client_blutooth.js script
require("./client_blutooth");

let mainWindow;

app.on("ready", () => {
  // Create a GUI window
  mainWindow = new BrowserWindow({
    width: 500,
    height: 300,
    webPreferences: {
      nodeIntegration: true, // Ensure Node.js integration is enabled
      contextIsolation: false,
    },
  });

  // Properly format the HTML content for the window
  mainWindow.loadURL(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: Arial, sans-serif;
          }
          #log {
            font-size: 12px;
            color: #333;
            white-space: pre-wrap;
            overflow-y: auto;
            height: 80%;
            width: 90%;
            border: 1px solid #ccc;
            padding: 10px;
            background: #f9f9f9;
          }
        </style>
      </head>
      <body>
        <h2>Printer Client Running...</h2>
        <div id="log"></div>
        <script>
          const { ipcRenderer } = require('electron');
          ipcRenderer.on('log', (event, message) => {
            const logDiv = document.getElementById('log');
            logDiv.textContent += message + '\\n';
            logDiv.scrollTop = logDiv.scrollHeight; // Auto-scroll to the bottom
          });
        </script>
      </body>
    </html>`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  log.info("Main window created");
});

app.on("window-all-closed", () => {
  // Stop the power save blocker
  if (blockerId && powerSaveBlocker.isStarted(blockerId)) {
    powerSaveBlocker.stop(blockerId);
    log.info("Power save blocker stopped");
  }
  app.quit();
});

// const { app, BrowserWindow } = require("electron");
// const fs = require("fs");

// // Run the client_blutooth.js script directly
// require("./client_blutooth");

// app.on("ready", () => {
//   // Optional: Create a GUI window
//   const win = new BrowserWindow({ width: 500, height: 300 });
//   win.loadURL(`data:text/html,
//     <html>
//       <head>
//         <style>
//           body {
//             display: flex;
//             justify-content: center;
//             align-items: center;
//             height: 100vh;
//             margin: 0;
//             font-family: Arial, sans-serif;
//           }
//         </style>
//       </head>
//       <body>
//         <h2>Printer Client Running...</h2>
//       </body>
//     </html>`);
// });


// const { app, BrowserWindow } = require("electron");
// const { exec } = require("child_process");
// const fs = require("fs");

// app.on("ready", () => {
//   // Run your Node.js script in the background
//   const logFile = "client_log.txt";
//   exec("node client_blutooth.js", (err, stdout, stderr) => {
//     if (err) {
//       fs.appendFileSync(logFile, `Error: ${err.message}\n`);
//     }
//     if (stdout) {
//       fs.appendFileSync(logFile, `Output: ${stdout}\n`);
//     }
//     if (stderr) {
//       fs.appendFileSync(logFile, `Stderr: ${stderr}\n`);
//     }
//   });

//   // Optional: Create a GUI window
//   const win = new BrowserWindow({ width: 500, height: 300 });
//   win.loadURL(`data:text/html,
//     <html>
//       <head>
//         <style>
//           body {
//             display: flex;
//             justify-content: center;
//             align-items: center;
//             height: 100vh;
//             margin: 0;
//             font-family: Arial, sans-serif;
//           }
//         </style>
//       </head>
//       <body>
//         <h2>Printer Client Running...</h2>

//       </body>
//     </html>`);

//   //win.loadURL('data:text/html,<h1>Printer Client Running</h1>');
// });

// const { app, BrowserWindow } = require("electron");
// const { fork } = require("child_process");

// app.on("ready", () => {
//   // Fork the client_blutooth.js script
//   const clientProcess = fork(require.resolve("./client_blutooth"));

//   clientProcess.on("message", (message) => {
//     console.log("Message from client_blutooth.js:", message);
//   });

//   clientProcess.on("error", (err) => {
//     console.error("Error in client_blutooth.js process:", err);
//   });

//   clientProcess.on("exit", (code) => {
//     console.log(`client_blutooth.js process exited with code ${code}`);
//   });

//   // Optional: Create a GUI window
//   const win = new BrowserWindow({ width: 500, height: 300 });
//   win.loadURL(`data:text/html,
//     <html>
//       <head>
//         <style>
//           body {
//             display: flex;
//             justify-content: center;
//             align-items: center;
//             height: 100vh;
//             margin: 0;
//             font-family: Arial, sans-serif;
//           }
//         </style>
//       </head>
//       <body>
//         <h2>Printer Client Running...</h2>
//       </body>
//     </html>`);
// });







