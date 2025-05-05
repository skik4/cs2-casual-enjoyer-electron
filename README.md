# CS2 Casual Enjoyer

**CS2 Casual Enjoyer** is an Electron-based desktop application that automates the process of joining a friend's Casual match in Counter-Strike 2 (CS2). Steam does not provide a built-in feature for this in CS2, and the Steam client may show outdated or delayed information about available slots in a match. This app helps you connect to your friend's Casual game as soon as a slot becomes available, improving your experience and saving time.

## How It Works

- The app uses Steam Web API requests to monitor your friend's match status.
- You can use either a Steam API key or a session token (recommended) for authentication.
- Tokens are valid for 24 hours and are obtained by redirecting you to the installed Steam client on your computer.
- The app notifies you and can automate the connection process as soon as a slot is detected in your friend's match.

## Requirements

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [Git](https://git-scm.com/) (optional, for cloning the repository)
- A valid Steam API key or session token

## Installation

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/cs2-casual-enjoyer-electron.git
   cd cs2-casual-enjoyer-electron
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

## Running the App

To start the application in development mode:
```sh
npm start
```

## How to Use

After the first launch, click on the label **"Steam Web API Token / Key"** in the application.  
A detailed instruction will be shown on how to obtain your Steam API token or key.

## Building the App

To build a portable version of the application for Windows:
```sh
npm run dist
```
The built files will be located in the `dist` directory.

## License

MIT

---
*Created by skik4*
