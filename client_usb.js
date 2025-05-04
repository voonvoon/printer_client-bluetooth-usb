const WebSocket = require("ws");
const escpos = require("escpos"); // npm i escpos
escpos.USB = require("escpos-usb");

// Job queue to handle incoming print jobs sequentially
const jobQueue = [];
let isProcessing = false;

const MAX_RETRIES = 5; // Maximum number of retries
const RETRY_DELAY = 3000; // Delay between retries in milliseconds

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
  //for send ack to server after pritning the job. is short-lived and only used for this function.
  const ws = new WebSocket("http://157.245.192.130:3000/print");
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
      //ensures ack is sent only after WebSocket connection fully established.
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "ack", jobId }));
        console.log("Acknowledgment sent to the server");
      });

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

function connectWebSocket() {
  //create here else re-connect won't works cuz the old one is closed due to internet disconnected.
  //for listening to incoming messages and managing the job queue.
  //maintaining a persistent connection with server to receive print jobs & handle reconnections in case of disconnection.
  const ws = new WebSocket("http://157.245.192.130:3000/print");

  // When the WebSocket connection is established
  ws.on("open", () => {
    console.log("Connected to the WebSocket server");
    console.log("Waiting for print jobs ...");
  });

  // When a message is received from the server
  ws.on("message", (data) => {
    console.log("Received a print job:", data);

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

    // Attempt to reconnect after a delay
    const reconnectInterval = setInterval(() => {
      console.log("Attempting to reconnect to WebSocket...");

      //each interval runs need to create a new WebSocket instance (newWs) to attempt reconnection.
      //newWs in setInterval is temporary & only for check/test if the connection can reached & re-established.
      const newWs = new WebSocket("http://157.245.192.130:3000/print");

      //Once connection successfully re-established,clear interval to stop further reconnection attempts.
      newWs.on("open", () => {
        console.log("Reconnected to WebSocket server.");
        clearInterval(reconnectInterval);

        //Once connection open need set up proper logic for handling messages, errors, and other events.
        //So Reinitialize the WebSocket connection logic here.
        connectWebSocket();
      });

      newWs.on("error", (err) => {
        console.error("Reconnection attempt failed:", err.message);
      });
    }, 5000); // Try reconnecting every 5 seconds
  });

  //traditionally sent by server, here we are sending it from client to server to workaround the issue of inactivity timeout.
  //else client will be disconnected after 30 seconds of inactivity.
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
      const currentTime = new Date().toLocaleTimeString(); // Get the current time
      console.log(
        `[${currentTime}] sending ping to server to keep websocket alive!`
      );
    }
  }, 30000);
}

connectWebSocket();

