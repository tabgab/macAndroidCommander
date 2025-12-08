const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testTar() {
    try {
        console.log('Checking tar on device...');
        const { stdout, stderr } = await execPromise('adb shell "tar --help"');
        console.log('STDOUT:', stdout);
        console.log('STDERR:', stderr);
    } catch (e) {
        console.log('Error running help:', e.message);
    }

    try {
        console.log('Testing pipe...');
        // Create a dummy file, tar it, pipe to adb to extract
        await execPromise('echo "hello" > test_file.txt');
        await execPromise('tar -cf - test_file.txt | adb shell "cd /sdcard/Download && tar -xf -"');
        console.log('Pipe command success');

        // Verify
        const { stdout } = await execPromise('adb shell "cat /sdcard/Download/test_file.txt"');
        console.log('Content on Android:', stdout);
    } catch (e) {
        console.error('Pipe failed:', e);
    }
}

testTar();
