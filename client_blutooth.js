// Using the SerialPort library to establish a serial communication channel
// with your Bluetooth printer, allowing you to send print jobs via a specified
// COM port and baud rate.

const WebSocket = require("ws");
const { SerialPort } = require("serialport"); // Explicitly import SerialPort
const path = require("path");
const sound = require("sound-play");
//const list = SerialPort.list;
//const ws = new WebSocket("http://157.245.192.130:3000/print");

let ws; // Declare WebSocket instance globally to manage it properly

// Define printer settings for Bluetooth connection
const PRINTER_CONFIG = { path: "COM4", baudRate: 9600 }; // Bluetooth printer settings
const MAX_RETRIES = 5; // Maximum number of retries
const RETRY_DELAY = 5000; // Delay between retries in milliseconds

// Job queue to handle incoming print jobs sequentially
const jobQueue = [];
let isProcessing = false;

// Function to process the next job in the queue
function processNextJob() {
  if (jobQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const { printData, jobId } = jobQueue.shift(); //.shift() is used to remove and retrieve the first item from an array.

  //The callback (() => { processNextJob(); }) is passed as the fourth argument to openPrinterWithRetry().
  openPrinterWithRetry(printData, jobId, 0, () => {
    processNextJob(); // Process the next job after the current one is done
  });
}

// function ensurePortAvailable(callback) {
//   setTimeout(() => {
//     list().then((ports) => {
//       const portAvailable = ports.some((port) => port.path === PRINTER_CONFIG.path);
//       if (portAvailable) {
//         //console.log('ports------------>', ports)
//         console.log(`Port ${PRINTER_CONFIG.path} is available`);
//         setTimeout(() => {
//           callback(); // Proceed to the next job after a 1-second delay
//         }, 4000); // Delay to ensure the port is ready
//       } else {
//         console.error(`Port ${PRINTER_CONFIG.path} is not yet available. Retrying...`);
//         ensurePortAvailable(callback); // Retry until the port is available
//       }
//     }).catch((err) => {
//       console.error("Error listing ports:", err);
//       callback(); // Proceed to the next job even if listing fails
//     });
//   }, 1000); // Check every 1 second
// }

// callback passed as the 4th arg to openPrinterWithRetry invoked in 3places:
//1.maximum number of retries is reached,printer can't connect.
//2.After printer sends the print job and closes the connection.
//3.error with the serial port

// Function to open the printer with retry logic

function openPrinterWithRetry(printData, jobId, retries = 0, callback) {
  //for send ack to server after pritning the job. is short-lived and only used for this function.
  //ws = new WebSocket("http://157.245.192.130:3000/print");

  const printer = new SerialPort({
    path: PRINTER_CONFIG.path,
    baudRate: PRINTER_CONFIG.baudRate,
    autoOpen: false, // Prevent auto-opening the port
  });

  printer.open((err) => {
    if (err) {
      console.error(`Error opening serial port: ${err.message}`);
      if (retries < MAX_RETRIES) {
        console.log(`Retrying to connect... (${retries + 1}/${MAX_RETRIES})`);
        setTimeout(
          () => openPrinterWithRetry(printData, jobId, retries + 1, callback),
          RETRY_DELAY
        );
      } else {
        console.error(
          "Max retries reached. Could not connect to the printer. move to next job."
        );
        callback(); // Move to the next job even if this one fails
      }
      return;
    }

    console.log(`Connected to printer via ${PRINTER_CONFIG.path}`);

    printer.write(Buffer.from(printData), (err) => {
      if (err) {
        console.error("Error sending data to printer:", err);
      } else {
        console.log("Print job sent successfully");

        // Send acknowledgment to the server
        // server will remove the job from the queue after receiving the ack.
        ws.send(JSON.stringify({ type: "ack", jobId }));
        console.log("Acknowledgment sent to the server");
      }

      // Close the connection after sending
      printer.close((closeErr) => {
        if (closeErr) {
          console.error("Error closing the port:", closeErr);
        } else {
          console.log("Port closed successfully");
        }
        setTimeout(() => {
          console.log("job in queue:", jobQueue.length);
          callback(); // Move to the next job after a 5-second delay to let pc system port close properly
        }, 5000);
      });
    });
  });

  printer.on("error", (err) => {
    console.error("Error with the serial port:", err);
    callback(); // Move to the next job on error
  });
}

function reconnectWebSocket() {
  const reconnectInterval = setInterval(() => {
    console.log("Attempting to reconnect to WebSocket...");

    const newWs = new WebSocket("http://157.245.192.130:3000/print");
    //const newWs = new WebSocket("http://localhost:3000/print");

    newWs.on("open", () => {
      console.log("Reconnected to WebSocket server.");
      clearInterval(reconnectInterval);

      // Assign the new WebSocket instance to the global `ws` variable
      //ws = newWs;

      // Reinitialize the WebSocket connection logic
      connectWebSocket();

      // Close the temporary WebSocket instance else will have same port open.
      newWs.close();
    });

    newWs.on("error", (err) => {
      console.error("Reconnection attempt failed:", err.message);
    });
  }, 5000); // Try reconnecting every 5 seconds
}

function connectWebSocket() {
  if (ws) {
    // Ensure the old WebSocket is properly closed
    //ws.removeAllListeners(); // Remove all event listeners
    ws.close(); // Close the WebSocket connection
    ws = null; // Clear the reference
  }
  //create here else re-connect won't works cuz the old one is closed due to internet disconnected.
  //for listening to incoming messages and managing the job queue.
  //maintaining a persistent connection with server to receive print jobs & handle reconnections in case of disconnection.

  ws = new WebSocket("http://157.245.192.130:3000/print");
  //ws = new WebSocket("http://localhost:3000/print");

  // When the WebSocket connection is established
  ws.on("open", () => {
    console.log("Connected to the WebSocket server");
    console.log("Waiting for print jobs ...");

    // Notify the server that the client has reconnected
    ws.send(JSON.stringify({ type: "reconnected" }));
  });

  // When a message is received from the server
  ws.on("message", (data) => {
    console.log("Received a print job:", data);

    // Play the notification sound (coin.mp3 in the root folder)
    const soundPath = path.join(__dirname, "coin.mp3");
    sound.play(soundPath).catch((err) => {
      console.error("Error playing sound:", err);
    });

    // Parse the received data to extract the jobId and print data
    let job;
    try {
      job = JSON.parse(data); // WebSocket sends strings, so parse JSON string into a JavaScript object
    } catch (err) {
      console.error("Error parsing job data:", err);
      return;
    }

    const { jobId, data: printData } = job; // Renames the data property to printData

    // Add the job to the queue
    jobQueue.push({ printData, jobId });
    if (!isProcessing) {
      processNextJob(); // Start processing if not already doing so
    }
  });

  // Handle WebSocket errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  // Handle WebSocket disconnection
  ws.on("close", (code) => {
    console.log(`WebSocket closed. Code: ${code}`);

    // Ensure the old WebSocket instance is cleaned up
    if (ws) {
      ws.close(); // Remove all event listeners from the old WebSocket
      ws = null; // Clear the reference to the old WebSocket
    }

    // Attempt to reconnect after a delay
    reconnectWebSocket();
  });

  //traditionally sent by server, here we are sending it from client to server to workaround the issue of inactivity timeout.
  //else client will be disconnected after 30 seconds of inactivity.
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Check if ws is not null
      ws.send(JSON.stringify({ type: "ping" }));
      const currentTime = new Date().toLocaleTimeString(); // Get the current time
      console.log(
        `[${currentTime}] sending ping to server to keep websocket alive!`
      );
    } else {
      console.log("WebSocket is not open. Skipping ping.");
    }
  }, 20000);
}

connectWebSocket();
