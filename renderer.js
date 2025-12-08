
let currentLocalPath = '/';
let currentAndroidPath = '/sdcard/';
let selectedLocalFile = null;
let selectedAndroidFile = null;
let currentDeviceSerial = null;
let activePane = 'local'; // 'local' or 'android'

const localFileList = document.getElementById('local-file-list');
const androidFileList = document.getElementById('android-file-list');
const localPathDisplay = document.getElementById('local-path');
const androidPathDisplay = document.getElementById('android-path');
const deviceSelect = document.getElementById('device-select');
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.querySelector('.close-button');
const retryBtn = document.getElementById('btn-retry-devices');

const editorModal = document.getElementById('editor-modal');
const editorFilename = document.getElementById('editor-filename');
const editorTextarea = document.getElementById('editor-textarea');
const btnSaveFile = document.getElementById('btn-save-file');
const btnCloseEditor = document.getElementById('btn-close-editor');
const closeEditorX = document.getElementById('close-editor');

let currentEditingFile = null; // { type: 'local'|'android', path: '...', name: '...' }

// Initial Load
window.addEventListener('DOMContentLoaded', async () => {
    currentLocalPath = '/Users/gabortabi';
    await loadLocalFiles(currentLocalPath);
    await refreshDevices();

    // Focus left pane by default
    localFileList.focus();
    activePane = 'local';

    // Listen for device changes
    window.electronAPI.onDeviceListChanged(async () => {
        console.log('Device list changed, refreshing...');
        await refreshDevices();
    });
});

// Device Management
async function refreshDevices() {
    try {
        const devices = await window.electronAPI.listDevices();
        deviceSelect.innerHTML = '<option value="">Select Device...</option>';

        if (devices.length === 0) {
            showHelpModal();
            androidFileList.innerHTML = '<div class="error">No devices found</div>';
            currentDeviceSerial = null;
            return;
        }

        let unauthorizedDevice = null;

        devices.forEach(d => {
            const option = document.createElement('option');
            option.value = d.serial;
            option.textContent = `${d.serial} (${d.state})`;
            deviceSelect.appendChild(option);

            if (d.state === 'unauthorized') unauthorizedDevice = d;
        });

        // Auto-select logic
        // 1. If current device is still there, keep it.
        // 2. If current device is gone, pick the first available authorized device.
        // 3. If only unauthorized devices, show help.

        const currentStillExists = currentDeviceSerial && devices.find(d => d.serial === currentDeviceSerial);

        if (!currentStillExists) {
            const firstAuthorized = devices.find(d => d.state === 'device');
            if (firstAuthorized) {
                currentDeviceSerial = firstAuthorized.serial;
                deviceSelect.value = currentDeviceSerial;
                hideHelpModal(); // Hide help if we found a good device
            } else if (unauthorizedDevice) {
                // Only unauthorized devices found
                currentDeviceSerial = null;
                showHelpModal('unauthorized');
                return;
            } else {
                // Should be covered by devices.length === 0 check, but just in case
                currentDeviceSerial = null;
            }
        } else {
            deviceSelect.value = currentDeviceSerial;
        }

        if (currentDeviceSerial) {
            await loadAndroidFiles(currentAndroidPath);
        }
    } catch (e) {
        console.error('Error refreshing devices:', e);
    }
}

deviceSelect.addEventListener('change', (e) => {
    currentDeviceSerial = e.target.value;
    if (currentDeviceSerial) {
        loadAndroidFiles(currentAndroidPath);
    } else {
        androidFileList.innerHTML = '';
    }
});

function showHelpModal(state = 'no-device') {
    const helpContent = document.querySelector('#help-modal .modal-content');
    if (state === 'unauthorized') {
        helpContent.innerHTML = `
            <span class="close-button">&times;</span>
            <h2>Device Unauthorized</h2>
            <p>A device is connected but not authorized.</p>
            <ol>
                <li>Check your Android device screen.</li>
                <li>Look for a "Allow USB debugging?" prompt.</li>
                <li>Tap <strong>Allow</strong> (and optionally "Always allow...").</li>
            </ol>
            <button id="btn-retry-devices">Retry Connection</button>
        `;
    } else {
        // Default No Device content
        helpContent.innerHTML = `
            <span class="close-button">&times;</span>
            <h2>No Android Device Found</h2>
            <p>Please ensure:</p>
            <ol>
                <li>Android device is connected via USB.</li>
                <li><strong>Developer Options</strong> are enabled on the phone.</li>
                <li><strong>USB Debugging</strong> is turned ON.</li>
                <li>File Transfer mode (MTP) is selected (sometimes required).</li>
            </ol>
            <button id="btn-retry-devices">Retry Connection</button>
        `;
    }

    // Re-attach listeners since we overwrote innerHTML
    helpContent.querySelector('.close-button').onclick = hideHelpModal;
    helpContent.querySelector('#btn-retry-devices').onclick = async () => {
        hideHelpModal();
        await refreshDevices();
    };

    helpModal.style.display = 'flex';
}

function hideHelpModal() {
    helpModal.style.display = 'none';
}

closeHelpBtn.onclick = hideHelpModal;
retryBtn.onclick = async () => {
    hideHelpModal();
    await refreshDevices();
};

window.onclick = (event) => {
    if (event.target === helpModal) {
        hideHelpModal();
    }
};

// Editor Modal Logic
function showEditor(filename, content, isReadOnly = false) {
    editorFilename.textContent = filename;
    editorTextarea.value = content;
    editorTextarea.readOnly = isReadOnly;
    btnSaveFile.style.display = isReadOnly ? 'none' : 'inline-block';
    editorModal.style.display = 'flex';
    editorTextarea.focus();
}

function hideEditor() {
    editorModal.style.display = 'none';
    currentEditingFile = null;
    // Return focus to active pane
    if (activePane === 'local') localFileList.focus();
    else androidFileList.focus();
}

btnCloseEditor.onclick = hideEditor;
closeEditorX.onclick = hideEditor;

btnSaveFile.onclick = async () => {
    if (!currentEditingFile) return;
    try {
        const content = editorTextarea.value;
        if (currentEditingFile.type === 'local') {
            await window.electronAPI.saveLocalFile(currentEditingFile.path, content);
        } else {
            await window.electronAPI.saveAndroidFile(currentEditingFile.path, content, currentDeviceSerial);
        }
        hideEditor();
        refresh(); // Refresh to update timestamps/sizes if needed
    } catch (e) {
        alert('Error saving file: ' + e);
    }
};

// Progress Modal
const progressModal = document.getElementById('progress-modal');
const progressTitle = document.getElementById('progress-title');
const progressMessage = document.getElementById('progress-message');

function showProgress(title, message) {
    progressTitle.textContent = title;
    progressMessage.textContent = message;
    progressModal.style.display = 'flex';
}

function hideProgress() {
    progressModal.style.display = 'none';
}

// Operations
async function performCopy() {
    if (activePane === 'local') {
        if (!selectedLocalFile) return alert('No file selected in Local pane.');
        if (!currentDeviceSerial) return alert('No Android device connected.');

        const source = selectedLocalFile.path;
        const dest = currentAndroidPath + (currentAndroidPath.endsWith('/') ? '' : '/') + selectedLocalFile.name;

        if (confirm(`Copy ${selectedLocalFile.name} to Android?`)) {
            try {
                showProgress('Copying...', `Copying ${selectedLocalFile.name} to Android`);
                await window.electronAPI.copyToAndroid(source, dest, currentDeviceSerial);
                await refreshFiles();
            } catch (e) {
                alert('Copy failed: ' + e);
            } finally {
                hideProgress();
            }
        }
    } else {
        if (!selectedAndroidFile) return alert('No file selected in Android pane.');

        const source = selectedAndroidFile.path;
        const dest = currentLocalPath + (currentLocalPath.endsWith('/') ? '' : '/') + selectedAndroidFile.name;

        if (confirm(`Copy ${selectedAndroidFile.name} to Mac?`)) {
            try {
                showProgress('Copying...', `Copying ${selectedAndroidFile.name} to Mac`);
                await window.electronAPI.copyToMac(source, dest, currentDeviceSerial);
                await refreshFiles();
            } catch (e) {
                alert('Copy failed: ' + e);
            } finally {
                hideProgress();
            }
        }
    }
}

async function performDelete() {
    if (activePane === 'local') {
        if (!selectedLocalFile) return alert('No file selected.');
        if (confirm(`Delete ${selectedLocalFile.name}?`)) {
            try {
                showProgress('Deleting...', `Deleting ${selectedLocalFile.name}`);
                await window.electronAPI.deleteLocal(selectedLocalFile.path);
                selectedLocalFile = null;
                await refreshFiles();
            } catch (e) {
                alert('Delete failed: ' + e);
            } finally {
                hideProgress();
            }
        }
    } else {
        if (!selectedAndroidFile) return alert('No file selected.');
        if (confirm(`Delete ${selectedAndroidFile.name}?`)) {
            try {
                showProgress('Deleting...', `Deleting ${selectedAndroidFile.name}`);
                await window.electronAPI.deleteAndroid(selectedAndroidFile.path, currentDeviceSerial);
                selectedAndroidFile = null;
                await refreshFiles();
            } catch (e) {
                alert('Delete failed: ' + e);
            } finally {
                hideProgress();
            }
        }
    }
}

async function performViewEdit(isEdit) {
    const file = activePane === 'local' ? selectedLocalFile : selectedAndroidFile;
    if (!file || file.isDirectory) return alert('Please select a file.');

    const binaryExtensions = [
        '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.zip', '.tar', '.gz', '.apk', '.exe', '.bin', '.iso', '.mp4', '.mp3', '.wav', '.dmg',
        '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
    ];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (binaryExtensions.includes(ext)) {
        if (confirm(`This is not a text file (${ext}). Open in default system viewer?`)) {
            try {
                showProgress('Opening...', `Opening ${file.name}`);
                if (activePane === 'local') {
                    await window.electronAPI.openExternal(file.path);
                } else {
                    const tempPath = await window.electronAPI.pullTempAndroid(file.path, currentDeviceSerial);
                    await window.electronAPI.openExternal(tempPath);
                }
            } catch (e) {
                alert('Failed to open file: ' + e);
            } finally {
                hideProgress();
            }
        }
        return;
    }

    try {
        let content = '';
        if (activePane === 'local') {
            content = await window.electronAPI.readLocalFile(file.path);
        } else {
            content = await window.electronAPI.readAndroidFile(file.path, currentDeviceSerial);
        }

        currentEditingFile = {
            type: activePane,
            path: file.path,
            name: file.name
        };

        showEditor(file.name, content, !isEdit);
    } catch (e) {
        alert('Error opening file: ' + e);
    }
}

// UI Events
document.getElementById('btn-refresh').addEventListener('click', async () => {
    await loadLocalFiles(currentLocalPath);
    await refreshDevices();
});
document.getElementById('btn-copy').addEventListener('click', performCopy);
document.getElementById('btn-delete').addEventListener('click', performDelete);
document.getElementById('btn-view').addEventListener('click', () => performViewEdit(false));
document.getElementById('btn-edit').addEventListener('click', () => performViewEdit(true));
document.getElementById('btn-exit').addEventListener('click', () => window.close());

async function refreshFiles() {
    await loadLocalFiles(currentLocalPath);
    if (currentDeviceSerial) {
        await loadAndroidFiles(currentAndroidPath);
    }
}

function refresh() {
    refreshFiles();
}

async function loadLocalFiles(path) {
    try {
        const files = await window.electronAPI.listLocalFiles(path);
        renderFileList(localFileList, files, 'local', path);
        localPathDisplay.textContent = path;
        currentLocalPath = path;
    } catch (error) {
        console.error('Failed to load local files:', error);
        localFileList.innerHTML = '<div class="error">Error loading files</div>';
    }
}

async function loadAndroidFiles(path) {
    if (!currentDeviceSerial) return;
    try {
        const files = await window.electronAPI.listAndroidFiles(path, currentDeviceSerial);
        renderFileList(androidFileList, files, 'android', path);
        androidPathDisplay.textContent = path;
        currentAndroidPath = path;
    } catch (error) {
        console.error('Failed to load android files:', error);
        androidFileList.innerHTML = '<div class="error">Error loading files (Check ADB)</div>';
    }
}

function renderFileList(container, files, type, currentPath) {
    container.innerHTML = '';

    // Add ".." entry if not at root
    const upDiv = document.createElement('div');
    upDiv.className = 'file-item directory';
    upDiv.textContent = '..';
    upDiv.dataset.name = '..';
    upDiv.dataset.isDirectory = 'true';
    upDiv.onclick = () => {
        selectItem(upDiv, container);
        navigateUp(type);
    };
    container.appendChild(upDiv);

    files.forEach(file => {
        const div = document.createElement('div');
        div.className = `file-item ${file.isDirectory ? 'directory' : 'file'}`;
        div.textContent = file.name;
        div.dataset.name = file.name;
        div.dataset.isDirectory = file.isDirectory;
        div.dataset.path = currentPath + (currentPath.endsWith('/') ? '' : '/') + file.name;

        div.onclick = (e) => {
            selectItem(div, container);
            updateSelectionState(type, file, div.dataset.path);
        };

        div.ondblclick = () => {
            if (file.isDirectory) {
                navigateInto(type, file.name);
            }
        };

        container.appendChild(div);
    });
}

function selectItem(element, container) {
    const previouslySelected = container.querySelector('.selected');
    if (previouslySelected) previouslySelected.classList.remove('selected');
    element.classList.add('selected');
    element.scrollIntoView({
        block: 'nearest'
    });
}

function updateSelectionState(type, file, fullPath) {
    if (type === 'local') {
        selectedLocalFile = {
            name: file.name,
            path: fullPath,
            isDirectory: file.isDirectory
        };
    } else {
        selectedAndroidFile = {
            name: file.name,
            path: fullPath,
            isDirectory: file.isDirectory
        };
    }
}

function navigateUp(type) {
    if (type === 'local') {
        const parts = currentLocalPath.split('/').filter(p => p);
        parts.pop();
        const newPath = '/' + parts.join('/');
        loadLocalFiles(newPath || '/');
    } else {
        const parts = currentAndroidPath.split('/').filter(p => p);
        parts.pop();
        const newPath = '/' + parts.join('/');
        loadAndroidFiles(newPath || '/');
    }
}

function navigateInto(type, folderName) {
    if (type === 'local') {
        const newPath = currentLocalPath === '/' ? `/${folderName}` : `${currentLocalPath}/${folderName}`;
        loadLocalFiles(newPath);
    } else {
        const newPath = currentAndroidPath === '/' ? `/${folderName}` : `${currentAndroidPath}/${folderName}`;
        loadAndroidFiles(newPath);
    }
}

// Keyboard Navigation & Shortcuts
function handleKeyNavigation(e, container, type) {
    const items = Array.from(container.getElementsByClassName('file-item'));
    let selectedIndex = items.findIndex(item => item.classList.contains('selected'));

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex < items.length - 1) {
            const newItem = items[selectedIndex + 1];
            selectItem(newItem, container);
            updateSelectionFromElement(newItem, type);
        } else if (selectedIndex === -1 && items.length > 0) {
            selectItem(items[0], container);
            updateSelectionFromElement(items[0], type);
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex > 0) {
            const newItem = items[selectedIndex - 1];
            selectItem(newItem, container);
            updateSelectionFromElement(newItem, type);
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex !== -1) {
            const item = items[selectedIndex];
            if (item.dataset.name === '..') {
                navigateUp(type);
            } else if (item.dataset.isDirectory === 'true') {
                navigateInto(type, item.dataset.name);
            }
        }
    }
}

function updateSelectionFromElement(element, type) {
    const name = element.dataset.name;
    const isDirectory = element.dataset.isDirectory === 'true';
    const path = element.dataset.path;

    if (name === '..') return; // Don't track .. as a file selection for ops

    if (type === 'local') {
        selectedLocalFile = {
            name,
            path,
            isDirectory
        };
    } else {
        selectedAndroidFile = {
            name,
            path,
            isDirectory
        };
    }
}

// Global Shortcuts
window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
        e.preventDefault();
        performViewEdit(false);
    }
    if (e.key === 'F4') {
        e.preventDefault();
        performViewEdit(true);
    }
    if (e.key === 'F5') {
        e.preventDefault();
        performCopy();
    }
    if (e.key === 'F8') {
        e.preventDefault();
        performDelete();
    }
    if (e.key === 'F10') {
        e.preventDefault();
        window.close();
    }
});

localFileList.addEventListener('focus', () => {
    activePane = 'local';
});
androidFileList.addEventListener('focus', () => {
    activePane = 'android';
});

localFileList.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        androidFileList.focus();
    } else {
        handleKeyNavigation(e, localFileList, 'local');
    }
});

androidFileList.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        localFileList.focus();
    } else {
        handleKeyNavigation(e, androidFileList, 'android');
    }
});

