// const { Worker } = require('worker_threads');
// const os = require('os');
// const { performance } = require('perf_hooks');

// // Example jobs (Array of large numbers)
// const jobs = Array.from({ length: 100 }, () => 1e9);

// // Number of available CPU cores minus 2
// const numCPUs = os.cpus().length - 2;

// // Helper function to split jobs into chunks for each worker
// const chunkify = (arr, nodes) => {
//     const chunks = [];
//     const jobsCopy = [...arr];  // Copy jobs array
//     for (let i = nodes; i > 0; i--) {
//         chunks.push(jobsCopy.splice(0, Math.ceil(jobsCopy.length / i)));
//     }
//     return chunks;
// };

// // Function to run workers with specified concurrent workers
// function run(jobs, concurrentWorkers) {
//     const start = performance.now();  // Capture start time
//     let completedWorkers = 0;
//     const chunks = chunkify(jobs, concurrentWorkers);

//     // Spawn a worker for each chunk
//     chunks.forEach((data, i) => {
//         const worker = new Worker('./parallel.js');
//         worker.postMessage(data);  // Send data chunk to the worker

//         worker.on('message', (result) => {
//             console.log(`Worker ${i} completed its task.`);

//             completedWorkers++;
//             if (completedWorkers === concurrentWorkers) {
//                 const end = performance.now();
//                 console.log(`All workers completed. Time taken: ${(end - start) / 1000} seconds`);
//                 process.exit(0);  // Gracefully exit
//             }
//         });

//         worker.on('error', (error) => {
//             console.error(`Worker ${i} encountered an error: ${error}`);
//         });

//         worker.on('exit', (code) => {
//             if (code !== 0) {
//                 console.error(`Worker ${i} exited with code ${code}`);
//             }
//         });
//     });
// }

// // Run the workers
// run(jobs, numCPUs);

const { Worker } = require('worker_threads')
const express = require('express')
const os = require('os')

// Create an Express app
const app = express()
const port = 4000

// Number of available CPUs minus 2 (to leave 2 cores for non-blocking tasks)
const numCPUs = Math.max(os.cpus().length - 2, 1);  // Ensure at least 1 worker thread

// Global dataset variable
let dataset = []
const numRecords = 1e7 // Default 70,000 records
// Function to create the dataset in worker threads
// Function to create the dataset in worker threads with time profiling
function createDatasetInWorkers(numRecords) {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();  // Start time
        let completedWorkers = 0;
        let datasetChunks = [];

        const chunkSize = Math.ceil(numRecords / numCPUs);
        for (let i = 0; i < numCPUs; i++) {
            const worker = new Worker('./create-dataset-worker.js', {
                workerData: { startId: i * chunkSize + 1, endId: (i + 1) * chunkSize }
            });

            worker.on('message', (chunk) => {
                datasetChunks = datasetChunks.concat(chunk);
                completedWorkers++;
                if (completedWorkers === numCPUs) {
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

function multiplyMatrices(A, B) {
    let C = [];
    for (let i = 0; i < A.length; i++) {
        C[i] = [];
        for (let j = 0; j < B[0].length; j++) {
            C[i][j] = 0;
            for (let k = 0; k < A[0].length; k++) {
                C[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return C;
}

function multiplyMatricesInWorker(matrixA, matrixB) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./matrix-worker.js', {
            workerData: { matrixA, matrixB }
        });

        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}


// Initialize dataset generation at server startup
app.get('/generate-dataset', async (req, res) => {
  try {
    const startTime = performance.now()
    dataset = await createDatasetInWorkers(numRecords)
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

// Start the Express server
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
  console.log('Routes:')
  console.log(`- /generate-dataset?numRecords=<num> (Generate dataset)`)
  console.log(`- /search?q=<query> (Single-threaded search)`)
  console.log(`- /search-worker?q=<query> (Worker-threaded search)`)
})
