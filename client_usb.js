//i have solved few issues:
//1.if internet disconnected, auto reconnect once internet is back.
//2.if pc domain too long websocket will close, so added reconnect logic once pc wake up.
//3.all jobs in server side queue will be sent to client once connected for no1. and no2 scenario.
//4.if printer not connected/power off, it will retry 5 times to find the printer.

const WebSocket = require("ws");
const escpos = require("escpos"); // npm i escpos
escpos.USB = require("escpos-usb");
const path = require("path");
const sound = require("sound-play");

let ws; // Declare WebSocket instance globally to manage it properly

// Job queue to handle incoming print jobs sequentially
const jobQueue = [];
let isProcessing = false;

const MAX_RETRIES = 5; // Maximum number of retries
const RETRY_DELAY = 5000; // Delay between retries in milliseconds

// Function to process the next job in the queue
function processNextJob() {
  if (jobQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const { printData, jobId } = jobQueue.shift();

  // Attempt to print the job with retry logic
  printWithRetry(printData, jobId, 0, () => {
    processNextJob(); // Process the next job after the current one is done
  });
}

// Function to print with retry logic
function printWithRetry(printData, jobId, retries = 0, callback) {
  const devices = escpos.USB.findPrinter();

  if (devices.length === 0) {
    console.error("No USB printers detected. Please check your connection.");
    if (retries < MAX_RETRIES) {
      console.log(
        `Retrying to find printer... (${retries + 1}/${MAX_RETRIES})`
      );
      setTimeout(
        () => printWithRetry(printData, jobId, retries + 1, callback),
        RETRY_DELAY
      );
    } else {
      console.error("Max retries reached. Could not find a USB printer.");
      callback(); // Move to the next job even if this one fails
    }
    return;
  }

  // Select the first detected printer
  const device = new escpos.USB(
    devices[0].deviceDescriptor.idVendor,
    devices[0].deviceDescriptor.idProduct
  );
  const printer = new escpos.Printer(device);

  // Open the USB device and send the print job
  device.open(() => {
    // Directly send the raw data to the printer
    printer.text(Buffer.from(printData)); // Print the received data
    printer.cut(); // Cut the paper
    printer.close(() => {
      console.log("Print job sent successfully");

      //Send acknowledgment to the server
      //server will remove the job from the queue after receiving the ack.

      //ensures ack is sent only after WebSocket connection fully established.
      // ws.on("open", () => {
      //   ws.send(JSON.stringify({ type: "ack", jobId }));
      //   console.log("Acknowledgment sent to the server");
      // });
      ws.send(JSON.stringify({ type: "ack", jobId }));
      console.log("Acknowledgment sent to the server");

      ws.on("error", (err) => {
        console.error("WebSocket error while sending acknowledgment:", err);
      });

      callback(); // Move to the next job after printing
    });
  });

  device.on("error", (err) => {
    console.error("Error with the USB device:", err);
    if (retries < MAX_RETRIES) {
      console.log(`Retrying to print... (${retries + 1}/${MAX_RETRIES})`);
      setTimeout(
        () => printWithRetry(printData, jobId, retries + 1, callback),
        RETRY_DELAY
      );
    } else {
      console.error("Max retries reached. Could not complete the print job.");
      callback(); // Move to the next job even if this one fails
    }
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

    // Play the notification sound (coin.mp3 in the root folder)
    const soundPath = path.join(__dirname, "online.mp3");
    sound.play(soundPath).catch((err) => {
      console.error("Error playing sound:", err);
    });

    //Delay 5 seconds before notifying the server that the client has reconnected
    //server get the msg will run sendPendingJobs function to send all the pending jobs to client.
    setTimeout(() => {
      ws.send(JSON.stringify({ type: "reconnected" }));
      console.log("Reconnection message sent to the server after 5 seconds.");
    }, 5000);
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
    // Attempt to reconnect
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
      console.log(
        "Alert! WebSocket is not open. system trying to re-connect..."
      );
      // Play the notification sound (coin.mp3 in the root folder)
      const soundPath = path.join(__dirname, "alert.mp3");
      sound.play(soundPath).catch((err) => {
        console.error("Error playing sound:", err);
      });
    }
  }, 20000);
}

connectWebSocket();
