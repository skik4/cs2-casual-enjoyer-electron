# CS2 Casual Enjoyer

**CS2 Casual Enjoyer** is an Electron-based desktop application that automates the process of joining a friend's Casual match in Counter-Strike 2 (CS2). Steam does not provide a built-in feature for this in CS2, and the Steam client may show outdated or delayed information about available slots in a match. This app helps you connect to your friend's Casual match as soon as a slot becomes available, improving your experience and saving time.

## How It Works

- The app uses Steam Web API requests to monitor your friends' match statuses.
- You can use either a Steam API Key or a session Token (recommended) for authentication.
- The token is valid for 24 hours and is obtained by redirecting you to the installed Steam client on your computer. After it expires, you'll need to refresh it again through the same process. The key is also obtained by redirecting you to the Steam client and does not expire. However, using the app with the key requires your profile and friends list to be set to public — at least once to retrieve the friends list. After that, you can set them back to private, and the app will continue using the locally cached list. The token does not have such privacy requirements.
- After you press "Join", the app periodically checks for an available slot in your friend's Casual match. If a slot is found, it attempts to connect. If the connection is successful, the attempts stop; otherwise, the app keeps retrying until it succeeds, your friend leaves the Casual match, or you cancel the process.

## How to Run

The easiest way to use the application is to download the prebuilt `.exe` from the [Releases](https://github.com/skik4/cs2-casual-enjoyer-electron/releases) page and run it directly.  
No installation of Node.js or other dependencies is required.

## How to Use

After the first launch, click on the label **"Steam Web API Token / Key"** in the application.  
A detailed instruction will be shown on how to obtain your Steam API token or key.

## Building from Source

If you want to build the application yourself:

### Requirements

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [Git](https://git-scm.com/) (optional, for cloning the repository)
- A valid Steam API key or session token

### Installation

1. **Clone the repository:**

   ```sh
   git clone https://github.com/yourusername/cs2-casual-enjoyer-electron.git
   cd cs2-casual-enjoyer-electron
   ```

2. **Install dependencies:**

   ```sh
   npm install
   ```

### Running in Development Mode

To start the application in development mode:

```sh
npm start
```

### Building the App

To build a portable version of the application for Windows:

```sh
npm run dist
```

The built files will be located in the `dist` directory.

## License

MIT

---

### Created by skik4
