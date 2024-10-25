const express = require('express');
const { Worker } = require('worker_threads');
const os = require('os');
const { performance } = require('perf_hooks');
const bigInt = require('big-integer');
const path = require('path');
const { startLoadBalancer, manageCpuBoundTasks } = require('r-load-balancer.js');
const axios = require('axios')

const app = express();
const port = 3000;
const numRecords = 1e6;
const numCPUs = Math.max(os.cpus().length - 2, 1);  // Use available cores, leaving 2 for other tasks

// Queue for CPU-bound tasks managed by load balancer
const taskQueue = [];
const handleCpuTask = manageCpuBoundTasks(taskQueue);

// Global dataset
let dataset = [];

// Helper Functions
// ----------------

// Function to compute Fibonacci using BigInt for large numbers
function fibonacciBigInt(n) {
    let a = bigInt(0), b = bigInt(1);
    for (let i = 2; i <= n; i++) {
        [a, b] = [b, a.add(b)];
    }
    return b;
}

// Modular exponentiation function for RSA
function modExp(base, exponent, modulus) {
    let result = bigInt(1);
    base = base.mod(modulus);
    while (exponent.greater(0)) {
        if (exponent.mod(2).equals(1)) result = result.multiply(base).mod(modulus);
        exponent = exponent.divide(2);
        base = base.multiply(base).mod(modulus);
    }
    return result;
}

// Function to split dataset into chunks for parallel processing
function chunkifyDataset(dataset, chunkSize) {
    const chunks = [];
    for (let i = 0; i < dataset.length; i += chunkSize) {
        chunks.push(dataset.slice(i, i + chunkSize));
    }
    return chunks;
}

// Routes
// ------

// RSA-like Fibonacci using modular exponentiation (Single-threaded)
app.get('/rsa-fibonacci', (req, res) => {
    const n = parseInt(req.query.n, 10);
    if (isNaN(n) || n <= 0) {
        return res.status(400).json({ error: 'Please provide a valid positive integer for "n".' });
    }

    const fib = fibonacciBigInt(n);
    const exponent = bigInt(65537);
    const modulus = fibonacciBigInt(n - 1);

    const start = performance.now();
    const result = modExp(fib, exponent, modulus);
    const timeTaken = (performance.now() - start).toFixed(2);

    res.json({ number: n, fibonacci: fib.toString(), modExpResult: result.toString(), timeTaken: `${timeTaken} ms` });
});

// Function to get the number of idle cores based on CPU load
function getIdleCores() {
    const cpus = os.cpus();
    let idleCores = 0;

    cpus.forEach(cpu => {
        const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0);
        const idle = cpu.times.idle / total;
        if (idle > 0.7) idleCores++; // Treat core as idle if > 70% idle
    });

    return Math.max(1, idleCores); // Use at least 1 core
}

// Function to get segments based on the available idle cores
function getSegments(n, coreCount) {
    const segments = [];
    let currentStart = 1;

    for (let i = 0; i < coreCount; i++) {
        const segmentEnd = currentStart + Math.floor((n - currentStart) / (coreCount - i));
        segments.push({ start: currentStart, end: segmentEnd });
        currentStart = segmentEnd + 1;
    }

    return segments;
}

// Update the API to use only idle cores for the computation
app.get('/rsa-fibonacci-multithreaded', async (req, res) => {
    const n = parseInt(req.query.n, 10);

    if (isNaN(n) || n <= 0) {
        return res.status(400).json({ error: 'Please provide a valid positive integer for "n".' });
    }

    const idleCores = getIdleCores();
    const segments = getSegments(n, idleCores); // Use only idle cores
    const tasks = segments.map(segment => 
        handleCpuTask(path.resolve(__dirname, './rsa-fib-worker.js'), segment)
    );

    try {
      const start = performance.now();
        const partialResults = await Promise.all(tasks);
        
        // Combine results for the final Fibonacci value
        const combinedFibResult = partialResults.reduce((acc, val) => bigInt(acc).add(bigInt(val)), bigInt(0));

        // Perform modular exponentiation on combined result
        const exponent = bigInt(65537);
        const modulus = combinedFibResult.subtract(1); // Example modulus from previous Fibonacci result
        const modExpResult = combinedFibResult.modPow(exponent, modulus);
        const end = performance.now();
        const timeTaken = ((end - start) / 1000).toFixed(2);

        res.json({
            number: n,
            fibonacci: combinedFibResult.toString(),
            modExpResult: modExpResult.toString(),
            timeTaken: `${timeTaken}`,
            type: 'multi-threaded'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// Single-threaded Fibonacci computation route
app.get('/fibonacci-single', (req, res) => {
    const n = parseInt(req.query.n, 10);
    if (isNaN(n) || n < 0) {
        return res.status(400).json({ error: 'Please provide a valid non-negative integer.' });
    }

    const start = performance.now();
    const result = fibonacciBigInt(n);
    const timeTaken = (performance.now() - start).toFixed(2);

    res.json({ number: n, fibonacci: result.toString(), timeTaken: `${timeTaken} ms`, type: 'single-threaded' });
});

// Multi-threaded Fibonacci computation route
app.get('/fibonacci', async (req, res) => {
    const n = parseInt(req.query.n, 10);
    if (isNaN(n) || n < 0) {
        return res.status(400).json({ error: 'Query parameter "n" must be a non-negative integer.' });
    }

    try {
        const result = await handleCpuTask(path.resolve(__dirname, './fib-worker.js'), n);
        res.json({ n, fibonacci: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate dataset using worker threads
app.get('/generate-dataset', async (req, res) => {
    try {
        const datasetChunks = await createDatasetInWorkers(numRecords, numCPUs);
        dataset = datasetChunks.flat();
        res.json({ message: `Dataset created with ${dataset.length} records.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/fetch-photos', async (req, res) => {
  try {
    const response = await axios.get(
      'https://jsonplaceholder.typicode.com/photos'
    )
    if (response.status === 200) {
      res.json({
        message: 'Success! Data fetched from external API.',
        status: response.status,
        dataLength: response.data.length
      })
    } else {
      res.status(response.status).json({
        message: 'Failed to fetch data from external API.',
        status: response.status
      })
    }
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching data from external API.',
      error: error.message
    })
  }
})
// Health check route
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const totalMemoryMB = (os.totalmem() / 1024 / 1024).toFixed(2);
  const freeMemoryMB = (os.freemem() / 1024 / 1024).toFixed(2);
  const usedMemoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const loadAverage = os.loadavg(); // Returns array [1 min, 5 min, 15 min avg load]
  const uptimeHours = (os.uptime() / 3600).toFixed(2); // Uptime in hours
  const cpus = os.cpus();
  const totalCores = cpus.length;

  // Determine busy cores based on recent load (1-minute load average)
  const busyCores = Math.min(totalCores, Math.round(loadAverage[0]));
  const idleCores = totalCores - busyCores;

  res.json({
      system: {
          totalCores,
          busyCores,
          idleCores,
          loadAverage: { '1m': loadAverage[0], '5m': loadAverage[1], '15m': loadAverage[2] },
          uptime: `${uptimeHours} hours`
      },
      memory: {
          totalMemory: `${totalMemoryMB} MB`,
          freeMemory: `${freeMemoryMB} MB`,
          usedMemory: `${usedMemoryMB} MB`
      }
  });
});


// Create dataset using multiple workers
function createDatasetInWorkers(numRecords, availableCores) {
    return new Promise((resolve, reject) => {
        const chunkSize = Math.ceil(numRecords / availableCores);
        let completedWorkers = 0;
        let datasetChunks = [];

        for (let i = 0; i < availableCores; i++) {
            const worker = new Worker('./create-dataset-worker.js', {
                workerData: { startId: i * chunkSize + 1, endId: (i + 1) * chunkSize }
            });

            worker.on('message', chunk => {
                datasetChunks = datasetChunks.concat(chunk);
                if (++completedWorkers === availableCores) resolve(datasetChunks);
            });
            worker.on('error', reject);
            worker.on('exit', code => code !== 0 && reject(new Error(`Worker stopped with exit code ${code}`)));
        }
    });
}

// Start the load balancer for dynamic resource allocation
startLoadBalancer(app, 3000);
