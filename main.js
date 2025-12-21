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

const quoteForRemote = (path) => {
    // Wrap in double quotes for Android shell, escape internal double quotes and backticks
    // We assume the local shell execution will handle the outer wrapping if we passed it correctly?
    // Wait, we are using execPromise with a string.
    // The string we return here must be safe to pass to the LOCAL shell inside double quotes? No.
    // Let's rely on a helper that constructs the final command string parts.
    return '"' + path.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$') + '"';
};

// However, passing complex quotes to exec is painful. 
// A robust way for exec: wrap the argument in single quotes for the local shell.
const escapeLocal = (s) => {
    return "'" + s.replace(/'/g, "'\\''") + "'";
};

const quote = (path) => {
    // 1. Prepare for Remote: "path" (escaped)
    const remote = '"' + path.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$') + '"';
    // 2. Prepare for Local: 'remote' (escaped)
    return escapeLocal(remote);
};


// List Android Files
ipcMain.handle('list-android-files', async (event, dirPath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        // adb shell ls -l "path"
        // usage: adb shell ls -l <quoted_path>

        const safePath = quote(dirPath); // This produces ' "path" '
        const { stdout } = await execPromise(`adb ${serialCmd} shell ls -l ${safePath}`);

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

            let size = 0;
            // Parse size if it's a file
            // standard: [perms] [links] [owner] [group] [size] [date] [time] [name]
            if (!isDirectory && parts.length >= 5) {
                size = parseInt(parts[4], 10) || 0;
            }

            // If we assume the first 7 fields are metadata, the rest is name.
            if (parts.length >= 8) {
                const name = parts.slice(7).join(' ');
                return {
                    name: name,
                    isDirectory: isDirectory,
                    size: size,
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

// File Operations

ipcMain.handle('copy-to-android', async (event, localPath, androidPath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        const stats = await statPromise(localPath);
        // Note: For 'push', adb handles local path quotes locally (passed as arg to spawn if we used spawn, but here exec).
        // For remote path, it must be quoted for remote shell?
        // Actually, 'adb push' takes local and remote paths as arguments to ADB, NOT to a remote shell.
        // So standard local quoting rules apply for both.
        // Wait, 'adb push local remote'. Remote path is interpreted by adb server on device?
        // Usually adb push handles spaces if arguments are passed correctly to adb binary.
        // With execPromise(`adb push "local" "remote"`), local shell handles quotes, adb gets args.
        // ADB handles spaces in remote path fine usually.
        // BUT if remote path has specials, might be tricky.
        // Let's assume standard quotes work for push/pull as they are not 'adb shell' commands.
        // execPromise handles local shell quoting.

        // HOWEVER, we should escape double quotes in the paths for the LOCAL shell if we wrap them in double quotes.
        // const safeLocal = `"${localPath.replace(/"/g, '\\"')}"`;
        // const safeRemote = `"${androidPath.replace(/"/g, '\\"')}"`;
        // BETTER: Use our escapeLocal helper? No, that wraps in single quotes.

        // Let's stick to standard double quotes with escape for push/pull as confirmed working for standard files?
        // Or use escapeLocal for maximum safety on Mac/Linux.

        const safeLocal = escapeLocal(localPath);
        const safeRemote = escapeLocal(androidPath);

        if (stats.isDirectory()) {
            const localDir = path.dirname(localPath);
            const localName = path.basename(localPath);
            const tempTarName = `temp_copy_${Date.now()}.tar`;
            const tempTarPath = path.join(app.getPath('temp'), tempTarName);
            const androidTempPath = `/data/local/tmp/${tempTarName}`;
            const androidDestDir = path.dirname(androidPath);

            // Tar command runs locally
            const safeTempTarPath = escapeLocal(tempTarPath);
            const safeLocalDir = escapeLocal(localDir);
            const safeLocalName = escapeLocal(localName);

            await execPromise(`cd ${safeLocalDir} && tar -chf ${safeTempTarPath} ${safeLocalName}`);
            await execPromise(`adb ${serialCmd} push ${safeTempTarPath} ${escapeLocal(androidTempPath)}`);

            // Extract on Android: adb shell ...
            // These ARE shell commands so they need 'quote()'
            const safeAndroidDestDir = quote(androidDestDir);
            const safeAndroidTempPath = quote(androidTempPath);

            await execPromise(`adb ${serialCmd} shell "mkdir -p ${safeAndroidDestDir} && cd ${safeAndroidDestDir} && tar -xf ${safeAndroidTempPath}"`);

            await util.promisify(fs.unlink)(tempTarPath);
            await execPromise(`adb ${serialCmd} shell rm ${safeAndroidTempPath}`);

        } else {
            await execPromise(`adb ${serialCmd} push ${safeLocal} ${safeRemote}`);
        }
        return true;
    } catch (error) {
        console.error('Error copying to android:', error);
        throw error;
    }
});

ipcMain.handle('copy-local-local', async (event, sourcePath, destPath) => {
    try {
        // Node 16.7.0+ supports fs.cp for recursive copy
        // Or we use cp -R via exec for simplicity/robustness on unix?
        // Let's use fs.cp if available, or fallback.
        // Electron usually has modern node.
        await util.promisify(fs.cp)(sourcePath, destPath, { recursive: true });
        return true;
    } catch (error) {
        console.error('Error copying local-local:', error);
        throw error;
    }
});

ipcMain.handle('copy-android-android', async (event, sourcePath, destPath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        const safeSource = quote(sourcePath);
        const safeDest = quote(destPath);
        // Note: cp -r on Android (Toybox) works usually.
        await execPromise(`adb ${serialCmd} shell cp -r ${safeSource} ${safeDest}`);
        return true;
    } catch (error) {
        console.error('Error copying android-android:', error);
        throw error;
    }
});

ipcMain.handle('copy-to-mac', async (event, androidPath, localPath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        const safeAndroid = escapeLocal(androidPath);
        const safeLocal = escapeLocal(localPath);
        await execPromise(`adb ${serialCmd} pull ${safeAndroid} ${safeLocal}`);
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
        const safePath = quote(filePath);
        await execPromise(`adb ${serialCmd} shell rm -rf ${safePath}`);
        return true;
    } catch (error) {
        console.error('Error deleting android file:', error);
        throw error;
    }
});

ipcMain.handle('rename-local', async (event, oldPath, newPath) => {
    try {
        await util.promisify(fs.rename)(oldPath, newPath);
        return true;
    } catch (error) {
        console.error('Error renaming local file:', error);
        throw error;
    }
});

ipcMain.handle('rename-android', async (event, oldPath, newPath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        const safeOld = quote(oldPath);
        const safeNew = quote(newPath);
        await execPromise(`adb ${serialCmd} shell mv ${safeOld} ${safeNew}`);
        return true;
    } catch (error) {
        console.error('Error renaming android file:', error);
        throw error;
    }
});

ipcMain.handle('get-local-dir-size', async (event, dirPath) => {
    try {
        const safePath = escapeLocal(dirPath);
        const { stdout } = await execPromise(`du -k -d 0 ${safePath}`);
        const sizeStr = stdout.split(/\s+/)[0];
        const sizeKB = parseInt(sizeStr, 10);
        return sizeKB * 1024;
    } catch (error) {
        console.error('Error getting local dir size:', error);
        return 0;
    }
});

ipcMain.handle('get-android-dir-size', async (event, dirPath, deviceSerial) => {
    try {
        const serialCmd = deviceSerial ? `-s ${deviceSerial}` : '';
        const safePath = quote(dirPath);
        const { stdout } = await execPromise(`adb ${serialCmd} shell du -k -d 0 ${safePath}`);
        const sizeStr = stdout.split(/\s+/)[0];
        const sizeKB = parseInt(sizeStr, 10);
        return sizeKB * 1024;
    } catch (error) {
        console.error('Error getting android dir size:', error);
        return 0;
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
