const fs = require('fs');
const util = require('util');
const path = require('path');

async function testDeleteLocal() {
    const testFile = 'test-delete.txt';
    try {
        await util.promisify(fs.writeFile)(testFile, 'test content');
        console.log(`Created ${testFile}`);

        // Simulate delete logic
        const filePath = path.resolve(testFile);
        console.log(`Deleting ${filePath}`);

        const stats = await util.promisify(fs.stat)(filePath);
        if (stats.isDirectory()) {
            await util.promisify(fs.rm)(filePath, { recursive: true, force: true });
        } else {
            await util.promisify(fs.unlink)(filePath);
        }
        console.log('Deleted successfully');

        try {
            await util.promisify(fs.access)(testFile);
            console.error('Error: File still exists');
        } catch (e) {
            console.log('Verification: File is gone');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

testDeleteLocal();
