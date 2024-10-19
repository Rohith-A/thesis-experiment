const { parentPort, workerData } = require('worker_threads');

// Access the workerData which contains the startId and endId
const { startId, endId } = workerData;

// Function to generate a portion of the dataset
function generateDataset(startId, endId) {
    let datasetChunk = [];
    for (let i = startId; i <= endId; i++) {
        datasetChunk.push({
            id: i,
            name: i + ' - Record',
            data: `Some random data for record ${i}`
        });
    }
    return datasetChunk;
}

// Generate the dataset chunk and send it back to the main thread
const datasetChunk = generateDataset(startId, endId);
parentPort.postMessage(datasetChunk);
