export const SCREEN_W = 480;
export const SCREEN_H = 720;
export const BOARD_X = 15;
export const BOARD_Y = 108;
export const BOARD_SIZE = 450;
export const CELL = BOARD_SIZE / 15; // 30px per cell

export const COLORS = {
    BG: '#121212', // Sleek dark mode background
    BOARD_BORDER: '#2C3E50', // Modern border
    WHITE: '#FFFFFF',
    BLACK: '#000000',
    GREEN: '#43A047', // Clean balanced Green
    YELLOW: '#FBC02D', // Warm Golden Yellow
    RED: '#E53935', // Modern Red (Not too bright)
    BLUE: '#1E88E5', // Professional Blue
    LIGHT_GREEN: '#81C784',
    LIGHT_YELLOW: '#FFF176',
    LIGHT_RED: '#E57373',
    LIGHT_BLUE: '#64B5F6',
    DARK_GREEN: '#009432',
    DARK_YELLOW: '#D4AF37',
    DARK_RED: '#C0392B',
    DARK_BLUE: '#2980B9',
    GOLD: '#FFD700',
    DARK_GOLD: '#B7950B',
    GRAY: '#BDC3C7',
    DARK_GRAY: '#7F8C8D',
    TRACK_BG: '#FFFFFF',
    PURPLE: '#9B59B6',
};

// P0=Green(TL), P1=Yellow(TR), P2=Red(BR), P3=Blue(BL)
export const PLAYER_COLORS = [COLORS.GREEN, COLORS.YELLOW, COLORS.RED, COLORS.BLUE];
export const PLAYER_LIGHT  = [COLORS.LIGHT_GREEN, COLORS.LIGHT_YELLOW, COLORS.LIGHT_RED, COLORS.LIGHT_BLUE];
export const PLAYER_DARK   = [COLORS.DARK_GREEN, COLORS.DARK_YELLOW, COLORS.DARK_RED, COLORS.DARK_BLUE];
export const PLAYER_NAMES  = ["Sachin Kumar", "Thiago Rodrigues", "Govind", "Shivali Mahajan"];

// POV Rotation: Angles to make each player appear at Bottom-Left
// P0(TL)->270deg, P1(TR)->180deg, P2(BR)->90deg, P3(BL)->0deg
export const PLAYER_ROTATIONS = [
    (3 * Math.PI) / 2, // Player 0 (TL) -> rotate 270° CW to reach BL
    Math.PI,           // Player 1 (TR) -> rotate 180° CW to reach BL
    Math.PI / 2,       // Player 2 (BR) -> rotate 90° CW to reach BL
    0                  // Player 3 (BL) -> no rotation
];

// Token home base positions (col, row) inside each home area
export const HOME_POSITIONS = {
    0: [[1.75,1.75],[4.25,1.75],[1.75,4.25],[4.25,4.25]],         // Green TL
    1: [[10.75,1.75],[13.25,1.75],[10.75,4.25],[13.25,4.25]],     // Yellow TR
    2: [[10.75,10.75],[13.25,10.75],[10.75,13.25],[13.25,13.25]], // Red (Now BR)
    3: [[1.75,10.75],[4.25,10.75],[1.75,13.25],[4.25,13.25]],     // Blue (Now BL)
};

// ─── STANDARD LUDO PATH (CLOCKED) ──────────────────────────────────
// 52 cells, clockwise, starting at [6,5] moving Up
export const MAIN_PATH = [
    [6,5],[6,4],[6,3],[6,2],[6,1],[6,0], // 0-5
    [7,0],                               // 6
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5], // 7-12
    [9,6],[10,6],[11,6],[12,6],[13,6],[14,6], // 13-18
    [14,7],                              // 19
    [14,8],[13,8],[12,8],[11,8],[10,8],[9,8], // 20-25
    [8,9],[8,10],[8,11],[8,12],[8,13],[8,14], // 26-31
    [7,14],                              // 32
    [6,14],[6,13],[6,12],[6,11],[6,10],[6,9], // 33-38
    [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],      // 39-44
    [0,7],                               // 45
    [0,6],[1,6],[2,6],[3,6],[4,6],[5,6]       // 46-51
];

// Home stretch: leading to center
export const HOME_STRETCHES = [
    [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],       // P0 Yellow (TL): Left Arm (from [0,7])
    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],       // P1 Blue (TR): Top Arm (from [7,0])
    [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],   // P2 Red (BR): Right Arm (from [14,7])
    [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],   // P3 Green (BL): Bottom Arm (from [7,14])
];

// Start cell indices for [Y, B, R, G]
export const PLAYER_START_INDICES = [47, 8, 21, 34];

// Cell index just before start that triggers home turn
export const PLAYER_HOME_ENTRIES = [45, 6, 19, 32];

// Safe spots (Starts and midpoints)
export const SAFE_INDICES = [47, 8, 21, 34, 3, 16, 29, 42];

export const STAR_POSITIONS = [
    [1,6], [8,1], [13,8], [6,13], // Starts
    [6,2], [12,6], [8,12], [2,8]  // Midpoints
];

export const TEAM_MAP = {
    0: 0, 1: 0, // Team A: Yellow + Blue (or as desired)
    2: 1, 3: 1  // Team B: Red + Green
};

// ─── BOARD HELPERS ──────────────────────────────────────────────────
export function getCellType(col, row) {
    if (col <= 5 && row <= 5) return { type: 'home', player: 0 };
    if (col >= 9 && row <= 5) return { type: 'home', player: 1 };
    if (col >= 9 && row >= 9) return { type: 'home', player: 2 };
    if (col <= 5 && row >= 9) return { type: 'home', player: 3 };
    if (col >= 6 && col <= 8 && row >= 6 && row <= 8) return { type: 'center' };
    if (row === 7 && col >= 1 && col <= 6) return { type: 'stretch', player: 0 };
    if (col === 7 && row >= 1 && row <= 6) return { type: 'stretch', player: 1 };
    if (row === 7 && col >= 8 && col <= 13) return { type: 'stretch', player: 2 };
    if (col === 7 && row >= 8 && row <= 13) return { type: 'stretch', player: 3 };
    return { type: 'track' };
}

export function isStartCell(col, row) {
    return (col === 1 && row === 6) || (col === 8 && row === 1) || (col === 13 && row === 8) || (col === 6 && row === 13);
}

export function getStartPlayer(col, row) {
    if (col === 1 && row === 6) return 0;
    if (col === 8 && row === 1) return 1;
    if (col === 13 && row === 8) return 2;
    if (col === 6 && row === 13) return 3;
    return -1;
}

