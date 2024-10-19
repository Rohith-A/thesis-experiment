const os = require('os');

// Calculate available memory in megabytes
function calculateMaxOldSpaceSize() {
    const totalMemory = os.totalmem(); // Total system memory in bytes
    const freeMemory = os.freemem(); // Free system memory in bytes

    // Choose 80% of available memory to leave room for OS and other processes
    const memoryLimit = Math.floor((totalMemory * 0.8) / (1024 * 1024)); // Convert to MB

    console.log(`Total Memory: ${(totalMemory / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Free Memory: ${(freeMemory / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Setting max-old-space-size to: ${memoryLimit} MB`);

    if (memoryLimit <= 0 || isNaN(memoryLimit)) {
        throw new Error('Calculated memory limit is invalid.');
    }
    const fallbackMemoryLimit = 8192; // 4GB fallback

    if (memoryLimit <= 0 || isNaN(memoryLimit)) {
        memoryLimit = fallbackMemoryLimit
        console.log(`Using fallback memory limit: ${fallbackMemoryLimit} MB`);
        console.log(fallbackMemoryLimit);
    } else {
        console.log(memoryLimit);
    }
    
    return memoryLimit;
}

// Output the max-old-space-size value to use it in an npm script
const memoryLimit = calculateMaxOldSpaceSize();
console.log(memoryLimit); // This will output the memory limit in MB
