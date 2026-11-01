# Installation Guide

## Prerequisites

Before running Mac Android Commander, ensure you have the following installed:

1.  **Node.js & npm** (Only for running from source):
    *   Download from [nodejs.org](https://nodejs.org/) or install via Homebrew:
        ```bash
        brew install node
        ```

2.  **No ADB Install Required**:
    *   The application now bundles the Android Platform Tools (ADB), so you do **not** need to install them manually.

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

1.  **Connect your Android Device** with a cable or over Wi-Fi.

    **USB**:
    *   Connect via USB.
    *   Ensure **USB Debugging** is enabled in *Developer Options* on your phone.
    *   Authorize the computer on your phone if prompted.

    **Wi-Fi** (Android 11 or later):
    *   Put the phone and the Mac on the same Wi-Fi network.
    *   On the phone, turn on *Developer Options > Wireless debugging*.
    *   In the app, press **F2 Wireless** and pair the phone once. Use one of these methods:
        *   **QR code**: On the phone, tap *Pair device with QR code* and scan the code in the app.
        *   **Pairing code**: On the phone, tap *Pair device with pairing code*. Type the IP address & port and the 6-digit code from that dialog into the app.
    *   After pairing, the phone connects automatically whenever Wireless debugging is on.
    *   If the phone does not connect by itself, use the **Connect** tab. Type the IP address & port shown on the *Wireless debugging* screen. This port is different from the pairing port.

2.  **Start the App**:
    ```bash
    npm start
    ```

## Troubleshooting

*   **"No devices found"**: Ensure your device is connected and USB debugging is on. Run `adb devices` in a terminal to verify visibility.
*   **"Permission denied"**: Check if you need to authorize the USB debugging connection on your phone screen.
*   **Wireless phone not found**: Some networks (guest or corporate Wi-Fi) block device discovery. Type the address by hand in the **Connect** tab. Android can turn Wireless debugging off when the phone changes Wi-Fi networks. If the phone does not appear, check that Wireless debugging is still on.
