const fs = require('fs');

const data1 = Buffer.concat([
    Buffer.from('\x1B\x40', 'binary'), // Initialize printer
    Buffer.from('\x1B\x61\x01', 'binary'), // Center alignment
    Buffer.from('i want be a truck driver in USA!\n'), // Print text
    Buffer.from('\x1B\x61\x00', 'binary'), // Left alignment
    Buffer.from('Item 1      $100.00\n', 'utf8'), // Print item 1
    Buffer.from('Item 2      $150.00\n', 'utf8'), // Print item 2
    Buffer.from('--------------------\n', 'utf8'), // Separator
    Buffer.from('Total       $250.00\n', 'utf8'), // Print total
    Buffer.from('\x1D\x56\x41', 'binary'), // Cut paper
    Buffer.from('\x1B\x40', 'binary'),
]);

// Save the binary data to a file
fs.writeFileSync('truck_driver.bin', data1);

console.log('✅ Binary data saved to receipt.bin');