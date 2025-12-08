const fs = require('fs');
const path = require('path');
const util = require('util');

const readdirPromise = util.promisify(fs.readdir);
const statPromise = util.promisify(fs.stat);

async function testLocal() {
    try {
        const dirPath = process.cwd();
        console.log('Listing files in:', dirPath);
        const files = await readdirPromise(dirPath);
        const fileDetails = await Promise.all(files.map(async (file) => {
            try {
                const filePath = path.join(dirPath, file);
                const stats = await statPromise(filePath);
                return {
                    name: file,
                    isDirectory: stats.isDirectory(),
                    size: stats.size,
                };
            } catch (err) {
                return null;
            }
        }));
        const validFiles = fileDetails.filter(f => f !== null);
        console.log('Files found:', validFiles.length);
        console.log('First 5 files:', validFiles.slice(0, 5));
    } catch (error) {
        console.error('Error:', error);
    }
}

testLocal();
