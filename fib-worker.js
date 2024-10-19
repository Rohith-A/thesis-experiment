const { parentPort, workerData } = require('worker_threads');

// Function to compute Fibonacci using BigInt for large numbers
function fibonacciBigInt(n) {
    if (n <= 1) return BigInt(n);
    let a = BigInt(0), b = BigInt(1);
    for (let i = 2; i <= n; i++) {
        const temp = b;
        b = a + b;
        a = temp;
    }
    return b;
}

try {
    const result = fibonacciBigInt(workerData);
    parentPort.postMessage(result.toString()); // Convert BigInt to string
} catch (error) {
    parentPort.postMessage(null); // Send null in case of error
}
