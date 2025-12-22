# Mac Android Commander

A Midnight Commander-inspired dual-pane file manager for macOS and Android. Manage your Android files directly from your Mac using ADB, with a keyboard-centric interface.

![Screenshot](https://via.placeholder.com/800x600?text=Mac+Android+Commander+Screenshot)

## Features

*   **Dual-Pane Interface**: Classic two-panel layout for easy file management.
*   **Android Integration**: Seamlessly browse, copy, and delete files on connected Android devices via ADB.
*   **Keyboard Navigation**: Fully navigable using keyboard shortcuts (Arrows, Tab, Enter).
*   **File Operations**:
    *   **F3 View**: Quick look at text files. Opens non-text files (PDF, Images, Office docs) in the default system application.
    *   **F4 Edit**: Edit text files directly (saves back to Android).
    *   **F5 Copy**: Copy files/directories between Mac and Android. Supports multiple files.
    *   **F7 Rename**: Rename a file or directory.
    *   **F8 Delete**: Delete files/directories. Supports multiple files.
    *   **F9 Size**: Calculate directory size.
    *   **Multi-Selection**:
        *   **Mouse**: Click to select. Shift+Click to select a range.
        *   **Keyboard**: Shift+Up/Down to select a range.
        *   **Unified State**: Selection state is shared between mouse and keyboard actions.
    *   **Device Management**: Auto-detects connected devices; supports multiple devices.
    *   **File Sorting**: Sort files by Name, Date Modified, or Date Created.
*   **Robust Copying**: Handles large directories and symlinks correctly.

## Prerequisites

*   **macOS**: Currently designed for macOS.
*   **ADB (Android Debug Bridge)**: Must be installed and in your PATH.
    *   Install via Homebrew: `brew install android-platform-tools`
*   **Node.js**: Required to run the application.

## Quick Start

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Start the app: `npm start`

See [INSTALL.md](INSTALL.md) for detailed installation instructions.

## License

MIT
