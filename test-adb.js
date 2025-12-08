const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testAdb() {
    try {
        console.log('Running adb shell ls -l /sdcard/');
        const { stdout } = await execPromise('adb shell ls -l /sdcard/');
        console.log('Raw output length:', stdout.length);

        const lines = stdout.split('\n');
        console.log('First 5 lines:');
        lines.slice(0, 5).forEach(l => console.log(l));

        const files = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 4) return null;

            const permissions = parts[0];
            const isDirectory = permissions.startsWith('d');

            if (parts.length >= 8) {
                const name = parts.slice(7).join(' ');
                return {
                    name: name,
                    isDirectory: isDirectory
                };
            }
            return null;
        }).filter(f => f !== null && f.name !== '.' && f.name !== '..');

        console.log('Parsed files count:', files.length);
        console.log('First 5 parsed files:', files.slice(0, 5));

    } catch (e) {
        console.error('Error:', e);
    }
}

testAdb();
