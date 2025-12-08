# Installation Guide

## Prerequisites

Before running Mac Android Commander, ensure you have the following installed:

1.  **Node.js & npm**:
    *   Download from [nodejs.org](https://nodejs.org/) or install via Homebrew:
        ```bash
        brew install node
        ```

2.  **Android Platform Tools (ADB)**:
    *   The application relies on `adb` to communicate with your Android device.
    *   Install via Homebrew:
        ```bash
        brew install android-platform-tools
        ```
    *   **Verify Installation**: Open a terminal and run `adb devices`. You should see a list of attached devices (or an empty list if none are connected).

## Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/tabgab/macAndroidCommander.git
    cd macAndroidCommander
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

## Running the Application

1.  **Connect your Android Device**:
    *   Connect via USB.
    *   Ensure **USB Debugging** is enabled in *Developer Options* on your phone.
    *   Authorize the computer on your phone if prompted.

2.  **Start the App**:
    ```bash
    npm start
    ```

## Troubleshooting

*   **"No devices found"**: Ensure your device is connected and USB debugging is on. Run `adb devices` in a terminal to verify visibility.
*   **"Permission denied"**: Check if you need to authorize the USB debugging connection on your phone screen.
