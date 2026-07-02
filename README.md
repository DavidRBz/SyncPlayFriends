# SyncPlay

A lightweight, serverless web application designed to help friends synchronize local video playback using independent, real-time timers.

⚠️ **Important Notice on Repository Visibility**
This project is intended strictly for **private, personal use**. The repository is public *solely* because GitHub Pages requires a public repository for free static web hosting. It is not an actively maintained open-source project, a commercial SaaS, or a platform looking for public contributions. 

---

## 🚀 How it Works

Unlike traditional sync tools that force users to upload files to a server or stream video feed, SyncPlay treats video playback as a shared state machine. 

Instead of hammering the database with updates every single second, it synchronizes critical timestamps (`currentTime`, `isRunning`, and `updatedAt`). The frontend calculates the precise fluid time locally using `requestAnimationFrame`. This allows seamless coordination of offline or locally stored video files with near-zero latency and minimal database overhead.

## 🛠️ Tech Stack

- **Frontend:** HTML5, Tailwind CSS (via CDN)
- **Logic:** Modern JavaScript (Vanilla ES Modules)
- **Backend/Messaging:** Firebase Realtime Database & Firebase Anonymous Authentication

## ✨ Features

- **Room Sessions:** Instantly generate a unique session room via URL parameters (`?room=XYZ123`) with optional password protection.
- **Host Privileges (👑 Host):** The room creator receives administrative tools:
  - Global control to **Reset All** timers simultaneously.
  - Ability to **Kick Users** from the session in real time.
  - Authority to **Delete Room**, purging all room data instantly from the database.
- **Granular Individual Controls:** Non-host participants can only modify their own timer (Play/Pause, `+1s` / `-1s` fine-tuning, resetting, or explicit manual input using `HH:MM:SS`), while viewing others in read-only mode.
- **Client Security:** Firebase Security Rules ensure users can only write data to their own specific user ID node, completely blocking unauthorized manipulation.

---

## ⚙️ Running Locally

Because the application relies on modern JavaScript ES Modules, browsers will block execution if you open `index.html` directly from your file system (`file:///`).

To test or run it locally:
1. Ensure your Firebase configuration keys are populated inside `app.js`.
2. Serve the directory using a local HTTP server. (e.g., using the **Live Server** extension in VS Code, or running `npx serve` / `python -m http.server` in your terminal).
