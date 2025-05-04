const fs = require('fs');
const iconv = require('iconv-lite');

let receiptParts = [];

// 1. Initialize printer
receiptParts.push(Buffer.from([0x1b, 0x40]));

// 2. Store Name - Center, Bold
receiptParts.push(Buffer.from([0x1b, 0x61, 1])); // Center align
receiptParts.push(Buffer.from([0x1b, 0x45, 1])); // Bold on
receiptParts.push(Buffer.from("Lonely Food App\n"));
receiptParts.push(Buffer.from([0x1b, 0x45, 0])); // Bold off

// 2b. Store Info - small text, center
receiptParts.push(Buffer.from([0x1b, 0x4d, 1])); // Font B (smaller)
receiptParts.push(Buffer.from("123 Jalan Makan, 43000 Kajang, Selangor\n", "ascii"));
receiptParts.push(Buffer.from("hello@lonelyfood.my | 012-3456789\n", "ascii"));
receiptParts.push(Buffer.from("SSM: 2023123456\n", "ascii"));
receiptParts.push(Buffer.from([0x1b, 0x4d, 0])); // Back to Font A
receiptParts.push(Buffer.from("\n", "ascii"));

// 3. Header for Item, Qty, Price
receiptParts.push(Buffer.from([0x1b, 0x61, 0])); // Left align
receiptParts.push(Buffer.from("Item            Qty   Price\n", "ascii"));
receiptParts.push(Buffer.from("-----------------------------\n", "ascii"));

// 4. Food items - Left align
receiptParts.push(Buffer.from("Chicken Rice   x1    RM12.00\n", "ascii"));
receiptParts.push(Buffer.from("Teh Tarik      x2    RM10.00\n", "ascii"));
receiptParts.push(Buffer.from("Roti Canai     x3    RM4.50\n", "ascii"));
receiptParts.push(Buffer.from("-----------------------------\n", "ascii"));

// 5. Calculations
const subtotal = 12.0 + 10.0 + 4.5; // = 26.50
const tax = subtotal * 0.06; // = 1.59
const total = subtotal + tax; // = 28.09

receiptParts.push(Buffer.from(`Subtotal           RM${subtotal.toFixed(2)}\n`, "ascii"));
receiptParts.push(Buffer.from(`Tax (6%)           RM${tax.toFixed(2)}\n`, "ascii"));
receiptParts.push(Buffer.from(`Total              RM${total.toFixed(2)}\n`, "ascii"));

// 5b. Add "pls scan to claim e-invoice" message
receiptParts.push(Buffer.from("\n", "ascii"));
receiptParts.push(Buffer.from([0x1b, 0x4d, 1])); // Font B (smaller)
receiptParts.push(Buffer.from([0x1b, 0x61, 1])); // Center align
receiptParts.push(Buffer.from("pls scan to claim e-invoice\n", "ascii"));
receiptParts.push(Buffer.from([0x1b, 0x61, 0])); // Left align
receiptParts.push(Buffer.from([0x1b, 0x4d, 0])); // Back to Font A
receiptParts.push(Buffer.from("\n", "ascii"));

// 7. QR Code - Smaller (module size 4), center align
receiptParts.push(Buffer.from([0x1b, 0x61, 1])); // Center align
receiptParts.push(Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05])); // Size 4

const qrData = "https://lonely-food-app.vercel.app/";
const qrLength = qrData.length + 3;
const pL = qrLength & 0xff;
const pH = (qrLength >> 8) & 0xff;

receiptParts.push(Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]));
receiptParts.push(Buffer.from(qrData, "ascii"));
receiptParts.push(Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));

// 8. Add spacing after QR
receiptParts.push(Buffer.from("\n\n", "ascii"));

// 9. Chinese thank you message
receiptParts.push(Buffer.from([0x1c, 0x26])); // Enable double-byte
const chineseText = iconv.encode("非常感谢，欢迎下次光临！", "GB18030");
receiptParts.push(chineseText);
receiptParts.push(Buffer.from("\n\n", "ascii"));

// 10. Cut
receiptParts.push(Buffer.from([0x1d, 0x56, 0x00]));

// Combine all parts into a single buffer
const finalReceipt = Buffer.concat(receiptParts);

// Save the binary data to a file
fs.writeFileSync('receipt_full.bin', finalReceipt);

console.log('✅ Binary data saved to receipt.bin');