// const { parentPort } = require('worker_threads');

// // Listen for the message from the main thread
// parentPort.on('message', (jobs) => {
//     const results = jobs.map(job => {
//         // Simulating a CPU-bound task (e.g., heavy computation)
//         let count = 0;
//         for (let i = 0; i < job; i++) {
//             count += Math.sqrt(i);
//         }
//         return count;
//     });

//     // Send results back to the main thread
//     parentPort.postMessage(results);
// });


const { parentPort, workerData } = require('worker_threads');

// Access the workerData which contains the chunk and the search query
const { query, chunk } = workerData;

// Perform the search in the current chunk
function searchDataset(query, chunk) {
    return chunk.filter((record) => record.id == query); 
}

// Search the chunk and return the result
const result = searchDataset(query, chunk);

// Send the result back to the main thread
parentPort.postMessage(result);
