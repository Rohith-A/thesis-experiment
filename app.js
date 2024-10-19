const express = require('express');
const { Worker } = require('worker_threads');
const os = require('os');
const { performance } = require('perf_hooks');
const bigInt = require('big-integer');

const app = express();
const port = 3000;

// Number of available CPU cores minus 2 (to leave some for other tasks)
const numCPUs = Math.max(os.cpus().length - 2, 1);  // Ensure at least 1 worker thread

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

// Function to simulate RSA-like Fibonacci modular exponentiation test
function rsaFibonacciTest(n) {
    console.log(`Calculating Fibonacci(${n})...`);
    const fib = fibonacciBigInt(n);
    console.log(`Fibonacci(${n}) = ${fib.toString().slice(0, 30)}... (truncated)`);

    const exponent = bigInt(65537);  // RSA-like public exponent
    const modulus = fibonacciBigInt(n - 1);  // Use another Fibonacci number as modulus

    console.log(`Performing modular exponentiation with Fibonacci(${n})...`);
    const start = performance.now();
    const result = modExp(fib, exponent, modulus);
    const end = performance.now();

    console.log(`Modular exponentiation result: ${result.toString().slice(0, 30)}... (truncated)`);
    console.log(`Time taken: ${(end - start)} ms`);

    return {
        fibonacci: fib.toString(),
        modExpResult: result.toString(),
        timeTaken: `${(end - start).toFixed(2)} ms`,
    };
}

// API route for RSA-like Fibonacci modular exponentiation test
app.get('/rsa-fibonacci', (req, res) => {
    const n = parseInt(req.query.n, 10);

    if (isNaN(n) || n <= 0) {
        return res.status(400).json({ error: 'Please provide a valid positive integer for "n".' });
    }

    try {
        const result = rsaFibonacciTest(n);
        res.json({ number: n, ...result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred during the computation.' });
    }
});

// Function to calculate Fibonacci using a worker thread
function calculateFibonacci(n) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./fib-worker.js', { workerData: n });

        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

// Route to compute Fibonacci number using worker threads (multi-threaded)
app.get('/fibonacci', async (req, res) => {
    const n = parseInt(req.query.n, 10);
    if (isNaN(n) || n < 0) {
        return res.status(400).json({ error: 'Query parameter "n" must be a non-negative integer.' });
    }

    const start = performance.now();
    try {
        const result = await calculateFibonacci(n);
        const end = performance.now();
        const timeTaken = (end - start).toFixed(2);

        res.json({ n, fibonacci: result, timeTaken: `${timeTaken} ms`, type: 'multi-threaded' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Single-threaded Fibonacci function
function fibonacciIterativeBigInt(n) {
    if (n <= 1) return BigInt(n);
    let a = BigInt(0), b = BigInt(1);
    for (let i = 2; i <= n; i++) {
        const temp = b;
        b = a + b;
        a = temp;
    }
    return b;
}

// API route for single-threaded Fibonacci execution
app.get('/fibonacci-single', (req, res) => {
    const n = parseInt(req.query.n, 10); // Get the number from query parameter

    if (isNaN(n) || n < 0) {
        return res.status(400).json({ error: 'Please provide a valid non-negative integer.' });
    }

    const start = performance.now(); // Start time for performance measurement
    const result = fibonacciIterativeBigInt(n); // Calculate Fibonacci number using BigInt
    const end = performance.now(); // End time for performance measurement

    const timeTaken = (end - start).toFixed(2);

    res.json({ number: n, fibonacci: result.toString(), timeTaken: `${timeTaken} ms`, type: 'single-threaded' });
});


// rsa-fibonacci using worker thread (multi-threaded)
app.get('/rsa-fibonacci-multithreaded', (req, res) => {
    const n = parseInt(req.query.n, 10);

    if (isNaN(n) || n <= 0) {
        return res.status(400).json({ error: 'Please provide a valid positive integer for "n".' });
    }

    const { Worker } = require('worker_threads');
    const start = performance.now();

    // Use a worker to handle the heavy computation
    const worker = new Worker('./rsa-fib-worker.js', { workerData: n });

    worker.on('message', (result) => {
        const end = performance.now();
        const timeTaken = ((end - start) / 1000).toFixed(2);
        res.json({
            number: n,
            fibonacci: result.fibonacci,
            modExpResult: result.modExpResult,
            timeTaken: `${timeTaken}`,
            type: 'multi-threaded'
        });
    });

    worker.on('error', (error) => {
        res.status(500).json({ error: error.message });
    });

    worker.on('exit', (code) => {
        if (code !== 0) {
            res.status(500).json({ error: `Worker stopped with exit code ${code}` });
        }
    });
});

// Global dataset variable
let dataset = []
const numRecords = 1e6 // Default 70,000 records
// Function to create the dataset in worker threads
// Function to create the dataset in worker threads with time profiling
function createDatasetInWorkers(numRecords, availableCores) {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();  // Start time
        let completedWorkers = 0;
        let datasetChunks = [];

        const chunkSize = Math.ceil(numRecords / availableCores);
        for (let i = 0; i < availableCores; i++) {
            const worker = new Worker('./create-dataset-worker.js', {
                workerData: { startId: i * chunkSize + 1, endId: (i + 1) * chunkSize }
            });

            worker.on('message', (chunk) => {
                datasetChunks = datasetChunks.concat(chunk);
                completedWorkers++;
                if (completedWorkers === availableCores) {
                    const endTime = performance.now();
                    console.log(`Dataset created in ${(endTime - startTime) / 1000} seconds`);
                    resolve(datasetChunks);
                }
            });

            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        }
    });
}


// Function to search the dataset (single-threaded)
function searchDataset (query) {
  let data = null
  for (let i = 0; i <= numRecords; i++) {
    if (dataset[i]?.id == query) {
      data = dataset[i]
    }
  }
  return data
}

// Function to split the dataset into chunks for parallel search
const chunkifyDataset = (dataset, chunks) => {
  const chunkSize = Math.ceil(dataset.length / chunks)
  const datasetChunks = []
  for (let i = 0; i < chunks; i++) {
    datasetChunks.push(dataset.slice(i * chunkSize, (i + 1) * chunkSize))
  }
  return datasetChunks
}

// Function to search in worker threads (multi-threaded)
function searchInWorker (query) {
  return new Promise((resolve, reject) => {
    const datasetChunks = chunkifyDataset(dataset, numCPUs) // Split the dataset
    let results = []
    let completedWorkers = 0

    for (let i = 0; i < numCPUs; i++) {
      const worker = new Worker('./parallel.js', {
        workerData: { query, chunk: datasetChunks[i] }
      })

      worker.on('message', result => {
        results = results.concat(result) // Collect results from each worker
        completedWorkers++
        if (completedWorkers === numCPUs) {
          resolve(results) // All workers have completed
        }
      })

      worker.on('error', reject)
      worker.on('exit', code => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`))
        }
      })
    }
  })
}



// Initialize dataset generation at server startup
app.get('/generate-dataset', async (req, res) => {
  try {
    const startTime = performance.now()
    const availableCores = os.cpus().length - numCPUs
    dataset = await createDatasetInWorkers(numRecords, availableCores)
    const endTime = performance.now()
    console.log(`Dataset created in ${(endTime - startTime) / 1000} seconds`)

    res.json({
      message: `Dataset created with ${dataset.length} records.`,
      data: dataset
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Route for single-threaded search (in the main thread)
app.get('/search', (req, res) => {
  const query = req.query.q
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' })
  }

  console.log(`Searching for records with query: "${query}" (single-threaded)`)

  const result = searchDataset(query) // Search using a single thread
  res.json({ result, count: result?.length })
})

// Route for multi-threaded search (offloaded to worker threads)
app.get('/search-worker', async (req, res) => {
  const query = req.query.q
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' })
  }

  console.log(`Searching for records with query (worker): "${query}"`)

  try {
    const result = await searchInWorker(query)
    res.json({ result, count: result.length })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
console.log(app)
// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Using ${numCPUs} cores for worker threads.`);
});
