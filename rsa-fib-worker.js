const { parentPort, workerData } = require('worker_threads');
const bigInt = require('big-integer');

// Function to compute Fibonacci using BigInt for very large numbers
function fibonacciBigInt(n) {
    let a = bigInt(0), b = bigInt(1);
    for (let i = 2; i <= n; i++) {
        const temp = b;
        b = a.add(b);
        a = temp;
    }
    return b;
}

// Modular exponentiation function (similar to what RSA uses)
function modExp(base, exponent, modulus) {
    let result = bigInt(1);
    base = base.mod(modulus);
    while (exponent.greater(0)) {
        if (exponent.mod(2).equals(1)) {
            result = result.multiply(base).mod(modulus);
        }
        exponent = exponent.divide(2);
        base = base.multiply(base).mod(modulus);
    }
    return result;
}

// Perform Fibonacci and modular exponentiation
try {
    const n = workerData;
    const fib = fibonacciBigInt(n);
    const exponent = bigInt(65537);  // Common RSA public exponent
    const modulus = fibonacciBigInt(n - 1);  // Use another Fibonacci number as modulus

    const modExpResult = modExp(fib, exponent, modulus);

    // Send the result back to the main thread
    parentPort.postMessage({
        fibonacci: fib.toString(),
        modExpResult: modExpResult.toString(),
    });
} catch (error) {
    parentPort.postMessage({ error: error.message });
}
