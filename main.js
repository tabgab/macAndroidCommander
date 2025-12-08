const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const util = require('util');

const execPromise = util.promisify(exec);
const readdirPromise = util.promisify(fs.readdir);
const statPromise = util.promisify(fs.stat);

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // Open DevTools for debugging
    return mainWindow;
}



// ... (existing imports)

let adbTrackerProcess = null;

function startDeviceTracking(mainWindow) {
    if (adbTrackerProcess) return;

    console.log('Starting ADB device tracking...');
    // adb track-devices prints output whenever device state changes
    adbTrackerProcess = spawn('adb', ['track-devices']);

    adbTrackerProcess.stdout.on('data', (data) => {
        console.log(`ADB Tracker: Device list changed`);
        // Debounce or just emit? Just emit for now, renderer can handle it.
        // We send the event to the renderer, which will then call list-devices
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('device-list-changed');
        }
    });

    adbTrackerProcess.stderr.on('data', (data) => {
        console.error(`ADB Tracker Error: ${data}`);
    });

    adbTrackerProcess.on('close', (code) => {
        console.log(`ADB Tracker exited with code ${code}`);
        adbTrackerProcess = null;
        // Optional: Restart logic if it crashes unexpectedly
    });
}

app.whenReady().then(() => {
    const mainWindow = createWindow();
    startDeviceTracking(mainWindow);

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            const win = createWindow();
            startDeviceTracking(win);
        }
    });
});

app.on('window-all-closed', function () {
    if (adbTrackerProcess) {
        adbTrackerProcess.kill();
    }
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

// List Local Files
ipcMain.handle('list-local-files', async (event, dirPath) => {
    try {
        const files = await readdirPromise(dirPath);
        const fileDetails = await Promise.all(files.map(async (file) => {
            try {
                const filePath = path.join(dirPath, file);
                const stats = await statPromise(filePath);
                return {
                    name: file,
                    isDirectory: stats.isDirectory(),
                    size: stats.size,
                    mtime: stats.mtime,
                };
            } catch (err) {
                return null; // Ignore files we can't stat (permissions etc)
            }
        }));
        return fileDetails.filter(f => f !== null);
    } catch (error) {
        console.error('Error listing local files:', error);
        throw error;
    }
});

// List Devices
ipcMain.handle('list-devices', async () => {
    try {
        const { stdout } = await execPromise('adb devices');
        const lines = stdout.split('\n');
        // First line is "List of devices attached"
        // Subsequent lines are "serial\tdevice"
        const devices = lines
            .slice(1)
            .filter(line => line.trim().length > 0)
            .map(line => {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    return { serial: parts[0], state: parts[1] }; // state: device, offline, unauthorized
                }
                return null;
            })
            .filter(d => d !== null);
        return devices;
    } catch (error) {
        console.error('Error listing devices:', error);
        return []; // Return empty if adb fails
    }
});

// List Android Files
ipcMain.handle('list-android-files', async (event, dirPath, deviceSerial) => {
    try {
        // Use -L to dereference symlinks if needed, or just ls -l
        // -p appends / to directories, making it easier to parse? 
        // ls -l is standard.
        // Note: Android ls output format can vary slightly between versions/toybox/busybox.
        // We'll try a generic parsing approach.
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        const { stdout } = await execPromise(`adb ${serialCmd} shell ls -l "${dirPath}"`);

        // Parse stdout
        const lines = stdout.split('\n');
        const files = lines.map(line => {
            // Very basic parsing, needs refinement for robust usage
            // Typical line: drwxr-xr-x 2 root root 4096 2023-01-01 12:00 foldername
            // or: -rw-r--r-- 1 root root 1234 2023-01-01 12:00 filename

            const parts = line.trim().split(/\s+/);
            if (parts.length < 4) return null; // Skip invalid lines

            // Heuristic: Last part is usually name, but name can have spaces.
            // First part is permissions.
            const permissions = parts[0];
            const isDirectory = permissions.startsWith('d');

            // Finding where the date/time ends and name begins is tricky with just split.
            // Let's assume standard `ls -l` format:
            // [perms] [links] [owner] [group] [size] [date] [time] [name...]

            // If we assume the first 7 fields are metadata, the rest is name.
            // But date format varies.

            // Alternative: `adb shell ls -p` gives names with / for dirs.
            // But we want details (size, date).

            // Let's try `ls -pl` if supported, or just `ls -l` and do best effort.
            // Ideally we'd use `ls -lA` to get hidden files too.

            // For now, let's just return the raw line or a simple object and refine parsing later.
            // Let's try to extract name and isDir.

            let nameStartIndex = 0;
            // Skip first 5-6 parts?
            // This is fragile.

            // Better approach for name: `adb shell ls -1` to get just names, then `stat`? Too slow.
            // `adb shell ls -l` is best.

            // Let's just return the raw line for now to the renderer to debug, 
            // OR implement a better parser.
            // Let's try to parse the name from the end.

            // Common Android ls:
            // drwxrwx--x 3 root sdcard_rw 4096 2024-01-20 12:00 Android

            // If we assume the date is in parts[5] and parts[6] (YYYY-MM-DD HH:MM), 
            // then name starts at parts[7].

            if (parts.length >= 8) {
                const name = parts.slice(7).join(' ');
                return {
                    name: name,
                    isDirectory: isDirectory,
                    details: line // pass full line for debug/display
                };
            }
            return null;
        }).filter(f => f !== null && f.name !== '.' && f.name !== '..'); // ls -l usually doesn't show . and .. unless -a is used

        return files;

    } catch (error) {
        console.error('Error listing android files:', error);
        throw error;
    }
});

// File Operations

ipcMain.handle('copy-to-android', async (event, localPath, androidPath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        const stats = await statPromise(localPath);

        if (stats.isDirectory()) {
            // Strategy: Create temp tarball locally (dereferencing symlinks), push it, extract, delete.
            // This avoids pipe issues and "remote symlink failed" errors.

            const localDir = path.dirname(localPath);
            const localName = path.basename(localPath);
            const tempTarName = `temp_copy_${Date.now()}.tar`;
            const tempTarPath = path.join(app.getPath('temp'), tempTarName);
            const androidTempPath = `/data/local/tmp/${tempTarName}`; // /data/local/tmp is usually writable and good for temps
            const androidDestDir = path.dirname(androidPath); // Parent of destination

            // 1. Create local tarball with dereferenced symlinks (-h)
            // We cd to localDir so the tarball contains 'localName' at root
            await execPromise(`cd "${localDir}" && tar -chf "${tempTarPath}" "${localName}"`);

            // 2. Push tarball to Android
            await execPromise(`adb ${serialCmd} push "${tempTarPath}" "${androidTempPath}"`);

            // 3. Extract on Android
            // We mkdir -p the destination parent, then cd there and extract
            await execPromise(`adb ${serialCmd} shell "mkdir -p '${androidDestDir}' && cd '${androidDestDir}' && tar -xf '${androidTempPath}'"`);

            // 4. Cleanup
            await util.promisify(fs.unlink)(tempTarPath);
            await execPromise(`adb ${serialCmd} shell rm "${androidTempPath}"`);

        } else {
            // Use adb push for single files
            await execPromise(`adb ${serialCmd} push "${localPath}" "${androidPath}"`);
        }
        return true;
    } catch (error) {
        console.error('Error copying to android:', error);
        throw error;
    }
});

ipcMain.handle('copy-to-mac', async (event, androidPath, localPath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        // adb pull <remote> <local>
        await execPromise(`adb ${serialCmd} pull "${androidPath}" "${localPath}"`);
        return true;
    } catch (error) {
        console.error('Error copying to mac:', error);
        throw error;
    }
});

ipcMain.handle('delete-local', async (event, filePath) => {
    try {
        const stats = await statPromise(filePath);
        if (stats.isDirectory()) {
            await util.promisify(fs.rm)(filePath, { recursive: true, force: true });
        } else {
            await util.promisify(fs.unlink)(filePath);
        }
        return true;
    } catch (error) {
        console.error('Error deleting local file:', error);
        throw error;
    }
});

ipcMain.handle('delete-android', async (event, filePath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        // adb shell rm -rf <path>
        // Quote path to handle spaces
        await execPromise(`adb ${serialCmd} shell rm -rf "${filePath}"`);
        return true;
    } catch (error) {
        console.error('Error deleting android file:', error);
        throw error;
    }
});

// File Content Operations

ipcMain.handle('read-local-file', async (event, filePath) => {
    try {
        const content = await util.promisify(fs.readFile)(filePath, 'utf8');
        return content;
    } catch (error) {
        console.error('Error reading local file:', error);
        throw error;
    }
});

ipcMain.handle('save-local-file', async (event, filePath, content) => {
    try {
        await util.promisify(fs.writeFile)(filePath, content, 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving local file:', error);
        throw error;
    }
});

ipcMain.handle('read-android-file', async (event, filePath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        // Use pull to temp file to avoid buffer limits of exec
        const tempPath = path.join(app.getPath('temp'), `temp_read_${Date.now()}_${Math.random().toString(36).substring(7)}`);

        await execPromise(`adb ${serialCmd} pull "${filePath}" "${tempPath}"`);

        const content = await util.promisify(fs.readFile)(tempPath, 'utf8');

        // Cleanup
        await util.promisify(fs.unlink)(tempPath);

        return content;
    } catch (error) {
        console.error('Error reading android file:', error);
        throw error;
    }
});

ipcMain.handle('save-android-file', async (event, filePath, content, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        // Write content to a temp file locally, then push
        const tempPath = path.join(app.getPath('temp'), 'temp_edit_file');
        await util.promisify(fs.writeFile)(tempPath, content, 'utf8');

        await execPromise(`adb ${serialCmd} push "${tempPath}" "${filePath}"`);

        // Cleanup
        await util.promisify(fs.unlink)(tempPath);
        return true;
    } catch (error) {
        console.error('Error saving android file:', error);
        throw error;
    }
});

// System Viewer Integration
ipcMain.handle('open-external', async (event, filePath) => {
    try {
        await shell.openPath(filePath);
        return true;
    } catch (error) {
        console.error('Error opening external file:', error);
        throw error;
    }
});

ipcMain.handle('pull-temp-android', async (event, filePath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        const ext = path.extname(filePath);
        const tempName = `temp_view_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
        const tempPath = path.join(app.getPath('temp'), tempName);

        await execPromise(`adb ${serialCmd} pull "${filePath}" "${tempPath}"`);
        return tempPath;
    } catch (error) {
        console.error('Error pulling temp android file:', error);
        throw error;
    }
});
