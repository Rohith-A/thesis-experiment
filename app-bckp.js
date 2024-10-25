const express = require('express')
const path = require('path')
const { Worker } = require('worker_threads');
const { startLoadBalancer, manageCpuBoundTasks } = require('./loadBalancer')
const os = require('os')
const { performance } = require('perf_hooks')
const bigInt = require('big-integer')
const axios = require('axios')

const app = express()
const port = 3000
const numCPUs = Math.max(os.cpus().length - 2, 1);  // Ensure at least 1 worker thread

// Global dataset variable
let dataset = []
const numRecords = 1e6 // Default 70,000 records

// Queue for CPU-bound tasks
const taskQueue = []
const handleCpuTask = manageCpuBoundTasks(taskQueue)

// Function to compute Fibonacci using BigInt for large numbers
function fibonacciBigInt (n) {
  let a = bigInt(0),
    b = bigInt(1)
  for (let i = 2; i <= n; i++) {
    const temp = b
    b = a.add(b)
    a = temp
  }
  return b
}

// Modular exponentiation function
function modExp (base, exponent, modulus) {
  let result = bigInt(1)
  base = base.mod(modulus)
  while (exponent.greater(0)) {
    if (exponent.mod(2).equals(1)) {
      result = result.multiply(base).mod(modulus)
    }
    exponent = exponent.divide(2)
    base = base.multiply(base).mod(modulus)
  }
  return result
}

// RSA-like Fibonacci modular exponentiation test
function rsaFibonacciTest (n) {
  const fib = fibonacciBigInt(n)
  const exponent = bigInt(65537) // RSA-like public exponent
  const modulus = fibonacciBigInt(n - 1) // Fibonacci number as modulus

  const start = performance.now()
  const result = modExp(fib, exponent, modulus)
  const end = performance.now()

  return {
    fibonacci: fib.toString(),
    modExpResult: result.toString(),
    timeTaken: `${(end - start).toFixed(2)} ms`
  }
}

// Multi-threaded Fibonacci computation route
app.get('/fibonacci', async (req, res) => {
  const n = parseInt(req.query.n, 10)

  if (isNaN(n) || n < 0) {
    return res
      .status(400)
      .json({ error: 'Query parameter "n" must be a non-negative integer.' })
  }

  try {
    // Use worker threads to calculate Fibonacci in a separate thread
    const result = await handleCpuTask(
      path.resolve(__dirname, './fib-worker.js'),
      n
    )
    res.json({ number: n, fibonacci: result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Single-threaded Fibonacci computation
function fibonacciIterativeBigInt (n) {
  if (n <= 1) return BigInt(n)
  let a = BigInt(0),
    b = BigInt(1)
  for (let i = 2; i <= n; i++) {
    const temp = b
    b = a + b
    a = temp
  }
  return b
}

const chunkifyDataset = (dataset, chunkSize) => {
  const chunks = []
  for (let i = 0; i < dataset.length; i += chunkSize) {
    chunks.push(dataset.slice(i, i + chunkSize))
  }
  return chunks
}

function searchDataset (query) {
  let data = null
  for (let i = 0; i <= numRecords; i++) {
    if (dataset[i]?.id == query) {
      data = dataset[i]
    }
  }
  return data
}

// Single-threaded Fibonacci route
app.get('/fibonacci-single', (req, res) => {
  const n = parseInt(req.query.n, 10)

  if (isNaN(n) || n < 0) {
    return res
      .status(400)
      .json({ error: 'Please provide a valid non-negative integer.' })
  }

  const result = fibonacciIterativeBigInt(n)
  res.json({ number: n, fibonacci: result.toString(), type: 'single-threaded' })
})

// RSA-like Fibonacci route
app.get('/rsa-fibonacci', (req, res) => {
  const n = parseInt(req.query.n, 10)

  if (isNaN(n) || n <= 0) {
    return res
      .status(400)
      .json({ error: 'Please provide a valid positive integer for "n".' })
  }

  try {
    const result = rsaFibonacciTest(n)
    res.json({ number: n, ...result })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'An error occurred during the computation.' })
  }
})

app.get('/rsa-fibonacci-multi', async (req, res) => {
  const n = parseInt(req.query.n, 10)

  if (isNaN(n) || n <= 0) {
    return res
      .status(400)
      .json({ error: 'Please provide a valid positive integer for "n".' })
  }

  try {
    // Use worker threads to calculate RSA Fibonacci in a separate thread
    const result = await handleCpuTask(
      path.resolve(__dirname, './rsa-fib-worker.js'),
      n
    )
    res.json({ number: n, ...result })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'An error occurred during the computation.' })
  }
})

// Health route to fetch system metrics (available cores, memory, and load)
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage()
  const totalMemoryMB = (os.totalmem() / 1024 / 1024).toFixed(2) // Convert to MB
  const freeMemoryMB = (os.freemem() / 1024 / 1024).toFixed(2) // Convert to MB
  const usedMemoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) // Heap used in MB
  const cpus = os.cpus()
  const loadAverage = os.loadavg() // Load average for 1, 5, 15 minutes
  const uptimeHours = (os.uptime() / 3600).toFixed(2) // Convert uptime to hours

  // Calculate busy and idle cores
  let busyCores = 0
  let idleCores = 0

  cpus.forEach(cpu => {
    const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0) // Total time spent
    const idle = cpu.times.idle
    const idlePercentage = (idle / total) * 100

    if (idlePercentage < 5) {
      // If idle time is less than 5%, consider core busy
      busyCores++
    } else {
      idleCores++
    }
  })

  res.json({
    system: {
      totalCores: cpus.length,
      busyCores,
      idleCores,
      loadAverage: {
        '1m': loadAverage[0].toFixed(2),
        '5m': loadAverage[1].toFixed(2),
        '15m': loadAverage[2].toFixed(2)
      },
      uptime: `${uptimeHours} hours`
    },
    memory: {
      totalMemory: `${totalMemoryMB} MB`,
      freeMemory: `${freeMemoryMB} MB`,
      usedMemory: `${usedMemoryMB} MB`
    }
  })
})

// Dataset creation using worker threads
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

function searchDataset (query) {
  let data = null
  for (let i = 0; i <= numRecords; i++) {
    if (dataset[i]?.id == query) {
      data = dataset[i]
    }
  }
  return data
}

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

// Search route for single-threaded search in the dataset
app.get('/search', (req, res) => {
  const query = req.query.q
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' })
  }

  console.log('Dataset:', dataset) // Log the dataset to inspect its structure
  console.log('Query:', query) // Log the query to inspect what is being searched

  const result = searchDataset(query)
  res.json({ result })
})

// Multi-threaded search route using workers
// app.get('/search-worker', async (req, res) => {
//   const query = req.query.q
//   if (!query) {
//     return res.status(400).json({ error: 'Query parameter "q" is required' })
//   }

//   try {
//     const datasetChunks = chunkifyDataset(dataset, 100) // Split dataset into smaller chunks
//     const searchResults = []

//     for (const chunk of datasetChunks) {
//       // Pass each chunk to worker thread for search
//       const result = await handleCpuTask(
//         path.resolve(__dirname, './parallel.js'),
//         { chunk, query }
//       )
//       searchResults.push(...result)
//     }

//     res.json({ results: searchResults })
//   } catch (error) {
//     res.status(500).json({ error: error.message })
//   }
// })

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

// Generate dataset route using worker threads
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

// Fetch photos from external API route
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

// Start the load balancer (with dynamic resource allocation for I/O and CPU-bound tasks)
startLoadBalancer(app)
