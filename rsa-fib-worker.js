const { parentPort, workerData } = require('worker_threads');
const bigInt = require('big-integer');

// Function to compute partial Fibonacci range using BigInt for large numbers
function partialFibonacciBigInt(start, end) {
    let a = bigInt(0), b = bigInt(1);
    for (let i = 2; i <= end; i++) {
        const temp = b;
        b = a.add(b);
        a = temp;
        if (i === start) a = bigInt(b); // Save state at `start`
    }
    return b;
}

// Perform Fibonacci computation for the range provided in workerData
try {
    const { start, end } = workerData;
    const partialResult = partialFibonacciBigInt(start, end);
    parentPort.postMessage(partialResult.toString());
} catch (error) {
    parentPort.postMessage({ error: error.message });
}
