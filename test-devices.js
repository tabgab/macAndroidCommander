const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testDevices() {
    try {
        console.log('Running adb devices');
        const { stdout } = await execPromise('adb devices');
        console.log('Raw output:', stdout);

        const lines = stdout.split('\n');
        const devices = lines
            .slice(1)
            .filter(line => line.trim().length > 0)
            .map(line => {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    return { serial: parts[0], state: parts[1] };
                }
                return null;
            })
            .filter(d => d !== null);

        console.log('Parsed devices:', devices);
    } catch (e) {
        console.error('Error:', e);
    }
}

testDevices();
