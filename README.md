# 🎮 2 Truths 1 Lie — Live Game System

## Setup (takes 2 minutes)

### Requirements
- Node.js installed on the laptop (https://nodejs.org)
- All devices on the same Wi-Fi network

### Steps

1. **Put all 4 files in one folder:**
   - `server.js`
   - `admin.html`
   - `player.html`
   - `package.json`

2. **Open terminal in that folder and run:**
   ```
   npm install
   node server.js
   ```

3. **You'll see output like:**
   ```
   📺 Display (laptop):  http://localhost:3000/player.html
   📱 Admin (phone):     http://192.168.1.X:3000/admin.html
   ```

4. **Open on each device:**
   - **Laptop/TV** → `http://localhost:3000/player.html`
   - **Phone (admin)** → `http://192.168.1.X:3000/admin.html` ← use the IP shown

---

## How to Play

### Admin Phone Controls:
1. **GAME tab** → Set difficulty → Pick players (🎲 button triggers slot machine!)
2. Timer starts on both screens automatically
3. Press **LOCK ANSWER** when player commits
4. Optional: tap a **Challenger** chip to add a challenger
5. Press **REVEAL ANSWER** to show truth/lie
6. Award points → **NEXT ROUND**

### Player Screen (laptop):
- Shows current player, timer, 3 statements
- Slot machine animation plays when random pick is triggered
- Leaderboard panel appears when admin presses "Show Leaderboard"

---

## Features
- ⚡ Real-time sync via WebSocket
- 🎰 Slot machine 777-style draw animation
- ⚔️ Challenger system with point penalties
- ⏱️ Live countdown timer
- 🏆 Full leaderboard on both screens
- 4 built-in question sets + add your own
- CSV export