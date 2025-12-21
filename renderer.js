
// State Management
const panes = {
    left: {
        id: 'left',
        type: 'local', // 'local' or 'android'
        path: '/',
        history: [],
        selection: null,
        serial: null, // serial for android
        element: document.getElementById('left-file-list'),
        pathDisplay: document.getElementById('left-path'),
        selectElement: document.getElementById('left-device-select')
    },
    right: {
        id: 'right',
        type: 'android',
        path: '/sdcard/',
        history: [],
        selection: null,
        serial: null,
        element: document.getElementById('right-file-list'),
        pathDisplay: document.getElementById('right-path'),
        selectElement: document.getElementById('right-device-select')
    }
};

let activePaneId = 'left';
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.querySelector('.close-button');
const retryBtn = document.getElementById('btn-retry-devices');

const editorModal = document.getElementById('editor-modal');
const editorFilename = document.getElementById('editor-filename');
const editorTextarea = document.getElementById('editor-textarea');
const btnSaveFile = document.getElementById('btn-save-file');
const btnCloseEditor = document.getElementById('btn-close-editor');
const closeEditorX = document.getElementById('close-editor');


// Rename Modal
const renameModal = document.getElementById('rename-modal');
const renameInput = document.getElementById('rename-input');
const btnConfirmRename = document.getElementById('btn-confirm-rename');
const btnCancelRename = document.getElementById('btn-cancel-rename');
const closeRenameX = document.getElementById('close-rename');

let fileToRename = null; // { paneId: 'left'|'right', path: '...', name: '...' }

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Initial Load
window.addEventListener('DOMContentLoaded', async () => {
    panes.left.path = '/Users/gabortabi'; // Default local start

    // Focus default
    panes.left.element.focus();
    activePaneId = 'left';

    // Refresh devices to populate dropdowns, then load files
    await refreshDevices();
});

// Listen for device changes
window.electronAPI.onDeviceListChanged(async () => {
    console.log('Device list changed, refreshing...');
    await refreshDevices();
});

// Device Management

async function refreshDevices() {
    try {
        const devices = await window.electronAPI.listDevices();

        // Update global device tracker if needed, but primarily update dropdowns
        const deviceOptions = devices.map(d => ({
            value: d.serial,
            label: `${d.serial} (${d.state})`
        }));

        // Helper to populate select
        const populateSelect = (paneId) => {
            const pane = panes[paneId];
            const select = pane.selectElement;
            const currentValue = select.value;

            select.innerHTML = '<option value="local">Mac (Local)</option>';
            deviceOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                select.appendChild(option);
            });

            // Restore selection if possible, else default to... local? 
            // Or if pane was android and device is gone, switch to local?

            // If pane type is local, value should be 'local'.
            // If pane type is android, value should be serial.

            if (pane.type === 'local') {
                select.value = 'local';
            } else if (pane.type === 'android') {
                const exists = deviceOptions.find(d => d.value === pane.serial);
                if (exists) {
                    select.value = pane.serial;
                } else {
                    // Device gone. Switch to local or show error?
                    // Let's switch to local for stability
                    pane.type = 'local';
                    pane.serial = null;
                    pane.path = '/Users/gabortabi';
                    select.value = 'local';
                    // We might need to reload this pane
                    loadPaneFiles(paneId);
                }
            }
        };

        populateSelect('left');
        populateSelect('right');

        // Initial load if not done (e.g. first run)
        // If first run, left is local, right is android (if dev exists)
        if (!panes.right.serial && deviceOptions.length > 0 && panes.right.type === 'android') {
            // Auto-pick first device for right pane if it was waiting for one
            const firstAuth = devices.find(d => d.state === 'device');
            if (firstAuth) {
                panes.right.serial = firstAuth.serial;
                panes.right.selectElement.value = firstAuth.serial;
                loadPaneFiles('right');
            }
        }

        // Always ensure files are loaded/refreshed
        // But avoiding double load if we just switched type above? 
        // Let's just rely on loadPaneFiles being called when type changes, 
        // or explicitly call it here if we suspect device changes affect current view.

        // If we are viewing android files, refresh them just in case
        if (panes.left.type === 'android') loadPaneFiles('left');
        if (panes.right.type === 'android') loadPaneFiles('right');

    } catch (e) {
        console.error('Error refreshing devices:', e);
    }
}

// Select Listener Helpers
function setupPaneSelectListeners(paneId) {
    const pane = panes[paneId];
    pane.selectElement.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'local') {
            pane.type = 'local';
            pane.serial = null;
            // Default local path? or keep last if we had one?
            // For now reset to home to be safe or keep current if it makes sense?
            // If switching from Android /sdcard/ to Local /, /sdcard/ doesn't exist locally.
            pane.path = '/Users/gabortabi';
        } else {
            pane.type = 'android';
            pane.serial = val;
            pane.path = '/sdcard/';
        }
        loadPaneFiles(paneId);
    });
}

setupPaneSelectListeners('left');
setupPaneSelectListeners('right');

// Help Modal Logic (Simplified or Removed if flexible)
// We can show help if user tries to select Android and no devices found?
// Or just let the dropdown be empty of devices.
function showHelpModal() {
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
    if (event.target === helpModal) hideHelpModal();
};

// Generic File Listing
async function loadPaneFiles(paneId) {
    const pane = panes[paneId];
    pane.pathDisplay.textContent = pane.path;

    try {
        let files = [];
        if (pane.type === 'local') {
            files = await window.electronAPI.listLocalFiles(pane.path);
        } else {
            if (!pane.serial) {
                // Should not happen if type is android, but safety check
                pane.element.innerHTML = '<div class="error">No device selected</div>';
                return;
            }
            files = await window.electronAPI.listAndroidFiles(pane.path, pane.serial);
        }
        renderFileList(paneId, files); // Update renderFileList to use paneId
    } catch (error) {
        console.error(`Failed to load files for ${paneId}:`, error);
        pane.element.innerHTML = `<div class="error">Error loading files</div>`;
    }
}


// Rename Logic
async function performRename() {
    const pane = panes[activePaneId];
    const file = pane.selection;
    if (!file || file.name === '..') return alert('Please select a file to rename.');

    fileToRename = {
        paneId: activePaneId,
        path: file.path,
        name: file.name
    };
    renameInput.value = file.name;
    renameModal.style.display = 'flex';
    renameInput.focus();
    renameInput.select();
}

function hideRenameModal() {
    renameModal.style.display = 'none';
    fileToRename = null;
    panes[activePaneId].element.focus();
}

btnConfirmRename.onclick = async () => {
    if (!fileToRename) return;
    const newName = renameInput.value.trim();
    if (!newName || newName === fileToRename.name) {
        hideRenameModal();
        return;
    }

    try {
        const pane = panes[fileToRename.paneId];
        let oldPath = fileToRename.path; // Absolute path
        let newPath = '';

        // Robust directory path construction
        const lastSlashIndex = oldPath.lastIndexOf('/');
        const dir = oldPath.substring(0, lastSlashIndex);
        const parentDir = dir === '' ? '/' : dir;

        if (parentDir === '/') {
            newPath = '/' + newName;
        } else {
            newPath = parentDir + '/' + newName;
        }

        console.log(`Renaming ${oldPath} to ${newPath} (${pane.type})`);

        if (pane.type === 'local') {
            await window.electronAPI.renameLocal(oldPath, newPath);
        } else {
            await window.electronAPI.renameAndroid(oldPath, newPath, pane.serial);
        }

        hideRenameModal();
        await loadPaneFiles(fileToRename.paneId);

    } catch (e) {
        console.error(e);
        alert('Rename failed: ' + e);
    }
};

btnCancelRename.onclick = hideRenameModal;
closeRenameX.onclick = hideRenameModal;

// Directory Size Logic
async function performCalculateDirSize() {
    const pane = panes[activePaneId];
    const file = pane.selection;
    if (!file || !file.isDirectory || file.name === '..') return;

    const container = pane.element;
    const items = Array.from(container.getElementsByClassName('file-item'));
    const item = items.find(el => el.dataset.path === file.path);

    if (!item) return;
    const sizeEl = item.querySelector('.file-size');
    if (!sizeEl) return;

    sizeEl.textContent = '...';

    try {
        let sizeBytes = 0;
        if (pane.type === 'local') {
            sizeBytes = await window.electronAPI.getLocalDirSize(file.path);
        } else {
            sizeBytes = await window.electronAPI.getAndroidDirSize(file.path, pane.serial);
        }
        sizeEl.textContent = formatBytes(sizeBytes);
    } catch (e) {
        sizeEl.textContent = 'Error';
    }
}

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
    panes[activePaneId].element.focus();
}

btnCloseEditor.onclick = hideEditor;
closeEditorX.onclick = hideEditor;

btnSaveFile.onclick = async () => {
    if (!currentEditingFile) return;
    try {
        const content = editorTextarea.value;
        const pane = panes[currentEditingFile.paneId];

        if (pane.type === 'local') {
            await window.electronAPI.saveLocalFile(currentEditingFile.path, content);
        } else {
            await window.electronAPI.saveAndroidFile(currentEditingFile.path, content, pane.serial);
        }
        hideEditor();
        loadPaneFiles(currentEditingFile.paneId);
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
    const srcPaneId = activePaneId;
    const destPaneId = activePaneId === 'left' ? 'right' : 'left';

    const srcPane = panes[srcPaneId];
    const destPane = panes[destPaneId];

    const file = srcPane.selection;
    if (!file) return alert('No file selected.');
    if (file.name === '..') return;

    // Determine Destination Path
    // destPane.path + separator + file.name
    const separator = destPane.path.endsWith('/') ? '' : '/';
    const destPath = `${destPane.path}${separator}${file.name}`;

    const msg = `Copy ${file.name} to ${destPane.id === 'left' ? 'Left' : 'Right'} Pane (${destPane.type})?`;

    if (confirm(msg)) {
        try {
            showProgress('Copying...', `Copying ${file.name}...`);

            // Dispatch based on types
            if (srcPane.type === 'local' && destPane.type === 'local') {
                await window.electronAPI.copyLocalLocal(file.path, destPath);
            } else if (srcPane.type === 'local' && destPane.type === 'android') {
                await window.electronAPI.copyToAndroid(file.path, destPath, destPane.serial);
            } else if (srcPane.type === 'android' && destPane.type === 'local') {
                await window.electronAPI.copyToMac(file.path, destPath, srcPane.serial);
            } else if (srcPane.type === 'android' && destPane.type === 'android') {
                // Same device or different?
                // For now, assume single device scenario or simplistic cross-device if adb supports it (it doesn't directly).
                // If serials match, use shell cp.
                if (srcPane.serial === destPane.serial) {
                    await window.electronAPI.copyAndroidAndroid(file.path, destPath, srcPane.serial);
                } else {
                    alert('Copying between two DIFFERENT Android devices is not yet supported directly.');
                    return;
                }
            }

            await loadPaneFiles(destPaneId);
            // Refresh source too if it was a move or something changed? Copy doesn't change source.
        } catch (e) {
            alert('Copy failed: ' + e);
        } finally {
            hideProgress();
        }
    }
}

async function performDelete() {
    const pane = panes[activePaneId];
    const file = pane.selection;

    if (!file) return alert('No file selected.');
    if (file.name === '..') return;

    if (confirm(`Delete ${file.name}?`)) {
        try {
            showProgress('Deleting...', `Deleting ${file.name}`);
            if (pane.type === 'local') {
                await window.electronAPI.deleteLocal(file.path);
            } else {
                await window.electronAPI.deleteAndroid(file.path, pane.serial);
            }
            pane.selection = null;
            await loadPaneFiles(pane.id);
        } catch (e) {
            alert('Delete failed: ' + e);
        } finally {
            hideProgress();
        }
    }
}

async function performViewEdit(isEdit) {
    const pane = panes[activePaneId];
    const file = pane.selection;

    if (!file) return alert('Please select a file.');
    if (file.isDirectory) return alert(`Cannot ${isEdit ? 'edit' : 'view'} a directory. Use Enter to open it.`);

    const binaryExtensions = [
        '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.zip', '.tar', '.gz', '.apk', '.exe', '.bin', '.iso', '.mp4', '.mp3', '.wav', '.dmg',
        '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
    ];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (binaryExtensions.includes(ext)) {
        if (confirm(`This is not a text file (${ext}). Open in default system viewer?`)) {
            try {
                showProgress('Opening...', `Opening ${file.name}`);
                if (pane.type === 'local') {
                    await window.electronAPI.openExternal(file.path);
                } else {
                    const tempPath = await window.electronAPI.pullTempAndroid(file.path, pane.serial);
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
        if (pane.type === 'local') {
            content = await window.electronAPI.readLocalFile(file.path);
        } else {
            content = await window.electronAPI.readAndroidFile(file.path, pane.serial);
        }

        currentEditingFile = {
            paneId: activePaneId,
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
    // Refresh both panes
    await refreshDevices(); // This also triggers reloads if needed, but we can force it
    await loadPaneFiles('left');
    await loadPaneFiles('right');
});
document.getElementById('btn-copy').addEventListener('click', performCopy);
document.getElementById('btn-rename').addEventListener('click', performRename);
document.getElementById('btn-delete').addEventListener('click', performDelete);
document.getElementById('btn-size').addEventListener('click', performCalculateDirSize);
document.getElementById('btn-view').addEventListener('click', () => performViewEdit(false));
document.getElementById('btn-edit').addEventListener('click', () => performViewEdit(true));
document.getElementById('btn-exit').addEventListener('click', () => window.close());


function renderFileList(paneId, files) {
    const pane = panes[paneId];
    const container = pane.element;
    const currentPath = pane.path;

    container.innerHTML = '';
    pane.selection = null; // Clear selection on reload

    // Add ".." entry if not at root
    if (currentPath !== '/') {
        const upDiv = document.createElement('div');
        upDiv.className = 'file-item directory';
        upDiv.innerHTML = `<span class="file-name">..</span><span class="file-size"></span>`;
        upDiv.dataset.name = '..';
        upDiv.dataset.isDirectory = 'true';
        upDiv.onclick = () => {
            selectItem(paneId, upDiv);
            navigateUp(paneId);
        };
        container.appendChild(upDiv);
    }

    files.forEach(file => {
        const div = document.createElement('div');
        div.className = `file-item ${file.isDirectory ? 'directory' : 'file'}`;

        let sizeText = '';
        if (file.isDirectory) {
            sizeText = '<DIR>';
        } else {
            sizeText = formatBytes(file.size || 0);
        }

        div.innerHTML = `<span class="file-name">${file.name}</span><span class="file-size">${sizeText}</span>`;
        div.dataset.name = file.name;
        div.dataset.isDirectory = file.isDirectory;

        const separator = currentPath.endsWith('/') ? '' : '/';
        const fullPath = `${currentPath}${separator}${file.name}`;

        div.dataset.path = fullPath;

        div.onclick = (e) => {
            selectItem(paneId, div);
            updateSelectionState(paneId, file, fullPath);
        };

        div.ondblclick = () => {
            if (file.isDirectory) {
                navigateInto(paneId, file.name);
            }
        };

        container.appendChild(div);
    });
}

function selectItem(paneId, element) {
    const pane = panes[paneId];
    const container = pane.element;
    const previouslySelected = container.querySelector('.selected');
    if (previouslySelected) previouslySelected.classList.remove('selected');
    element.classList.add('selected');
    element.scrollIntoView({
        block: 'nearest'
    });
}

function updateSelectionState(paneId, file, fullPath) {
    const pane = panes[paneId];
    pane.selection = {
        name: file.name,
        path: fullPath,
        isDirectory: file.isDirectory
    };
}

function navigateUp(paneId) {
    const pane = panes[paneId];
    const parts = pane.path.split('/').filter(p => p);
    parts.pop();
    const newPath = '/' + parts.join('/');
    pane.path = newPath || '/';
    loadPaneFiles(paneId);
}

function navigateInto(paneId, folderName) {
    const pane = panes[paneId];
    // Avoid double slashes logic
    const separator = pane.path.endsWith('/') ? '' : '/';
    const newPath = `${pane.path}${separator}${folderName}`;
    pane.path = newPath;
    loadPaneFiles(paneId);
}

// Keyboard Navigation
function handleKeyNavigation(e, paneId) {
    const pane = panes[paneId];
    const container = pane.element;
    const items = Array.from(container.getElementsByClassName('file-item'));
    let selectedIndex = items.findIndex(item => item.classList.contains('selected'));

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex < items.length - 1) {
            const newItem = items[selectedIndex + 1];
            selectItem(paneId, newItem);
            updateSelectionFromElement(paneId, newItem);
        } else if (selectedIndex === -1 && items.length > 0) {
            selectItem(paneId, items[0]);
            updateSelectionFromElement(paneId, items[0]);
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex > 0) {
            const newItem = items[selectedIndex - 1];
            selectItem(paneId, newItem);
            updateSelectionFromElement(paneId, newItem);
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex !== -1) {
            const item = items[selectedIndex];
            if (item.dataset.name === '..') {
                navigateUp(paneId);
            } else if (item.dataset.isDirectory === 'true') {
                navigateInto(paneId, item.dataset.name);
            }
        }
    }
}

function updateSelectionFromElement(paneId, element) {
    const name = element.dataset.name;
    const isDirectory = element.dataset.isDirectory === 'true';
    const path = element.dataset.path;

    if (name === '..') {
        panes[paneId].selection = null;
        return;
    }

    panes[paneId].selection = {
        name,
        path,
        isDirectory
    };
}

// Global Shortcuts
window.addEventListener('keydown', (e) => {
    if (renameModal.style.display === 'flex') {
        if (e.key === 'Escape') hideRenameModal();
        if (e.key === 'Enter') btnConfirmRename.click();
        return;
    }

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
    if (e.key === 'F7') {
        e.preventDefault();
        performRename();
    }
    if (e.key === 'F8') {
        e.preventDefault();
        performDelete();
    }
    if (e.key === 'F9') {
        e.preventDefault();
        performCalculateDirSize();
    }
    if (e.key === 'F10') {
        e.preventDefault();
        window.close();
    }
});

panes.left.element.addEventListener('focus', () => {
    activePaneId = 'left';
});
panes.right.element.addEventListener('focus', () => {
    activePaneId = 'right';
});

panes.left.element.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        panes.right.element.focus();
    } else {
        handleKeyNavigation(e, 'left');
    }
});

panes.right.element.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        panes.left.element.focus();
    } else {
        handleKeyNavigation(e, 'right');
    }
});

