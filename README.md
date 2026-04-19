# 🎲 Ludo Yaar - Multiplayer Ludo Game

A premium, real-time multiplayer Ludo game with modern aesthetics, strategic depth, and social features.

## ✨ Key Features

- **Real-Time Multiplayer**: Play with up to 4 players globally using Socket.io synchronization.
- **Private Tables**: Generate unique room codes to play with friends.
- **Strategic Junctions**: Choose between entering "Home" or taking another "Lap" for strategic advantage (Ludo Star style).
- **POV Board Rotation**: Every player sees their own base at the bottom-left for the best perspective.
- **Turn Management**: 10-second turn timer with visual indicators and automatic bot-play for disconnected players.
- **Rich Social Interaction**:
  - Integrated Text Chat system.
  - Interactive Emoji Panel with floating animations.
  - Voice Chat signaling support.
  - Mute/Unmute controls for all players.
- **Premium Visuals**:
  - Glassmorphism-inspired UI elements.
  - 3D-styled dice animations.
  - Particle effects for kills and movements.
  - Animated avatars with active turn glowing.

## 🚀 Technology Stack

- **Frontend**: HTML5 Canvas, Vanilla JavaScript (Vite), Socket.io-client.
- **Backend**: Node.js, Express, Socket.io Server.
- **Infrastructure**: Dockerized & optimized for Railway.app deployment.

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v22.12.0 or higher)
- npm

### 1. Clone the repository
```bash
git clone <repository-url>
cd ludo
```

### 2. Install Dependencies
```bash
# Install server dependencies
cd server
npm install

# Install website dependencies
cd ../website
npm install
```

### 3. Run Locally
**Start Server:**
```bash
cd server
npm run dev
```

**Start Frontend:**
```bash
cd website
npm run dev
```

## 🚢 Deployment

The project is pre-configured for **Railway.app**.
- Uses `railway.toml` for deployment settings.
- Uses `Dockerfile` for containerized builds.
- Automatically handles Node.js versioning via `.node-version`.

## 📜 Game Rules
1. **Start**: Roll a 6 to move a token out of the home base.
2. **Movement**: Move tokens clockwise. Consecutive 6s give bonus rolls (up to 3).
3. **Kills**: Landing on an opponent's token sends it back home.
4. **Junction**: At the end of the lap, choose 'Home' or 'Lap' to continue.
5. **Winning**: The first player to move all 4 tokens into the center wins.

---
Developed with ❤️ by the Ludo Yaar Team.
