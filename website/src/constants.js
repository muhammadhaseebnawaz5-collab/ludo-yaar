export const SCREEN_W = 480;
export const SCREEN_H = 720;
export const BOARD_X = 15;
export const BOARD_Y = 108;
export const BOARD_SIZE = 450;
export const CELL = BOARD_SIZE / 15; // 30px per cell

export const COLORS = {
    BG: '#3E1A3D',
    BOARD_BORDER: '#5C3317',
    WHITE: '#FFFFFF',
    BLACK: '#000000',
    GREEN: '#28A33E',
    YELLOW: '#E3B022',
    RED: '#E33022',
    BLUE: '#2271E3',
    LIGHT_GREEN: '#5DC96E',
    LIGHT_YELLOW: '#F4D26B',
    LIGHT_RED: '#EF7569',
    LIGHT_BLUE: '#6A9DE6',
    DARK_GREEN: '#196123',
    DARK_YELLOW: '#9E7711',
    DARK_RED: '#901C13',
    DARK_BLUE: '#123D80',
    GOLD: '#F5B041',
    DARK_GOLD: '#D68910',
    GRAY: '#BDC3C7',
    DARK_GRAY: '#7F8C8D',
    TRACK_BG: '#FEFEFE',
    PURPLE: '#6A0DAD',
};

// P0=Yellow(TL), P1=Blue(TR), P2=Red(BR), P3=Green(BL)
export const PLAYER_COLORS = [COLORS.YELLOW, COLORS.BLUE, COLORS.RED, COLORS.GREEN];
export const PLAYER_LIGHT  = [COLORS.LIGHT_YELLOW, COLORS.LIGHT_BLUE, COLORS.LIGHT_RED, COLORS.LIGHT_GREEN];
export const PLAYER_DARK   = [COLORS.DARK_YELLOW,  COLORS.DARK_BLUE,  COLORS.DARK_RED,  COLORS.DARK_GREEN];
export const PLAYER_NAMES  = ["Sachin Kumar", "Thiago Rodrigues", "Govind", "Shivali Mahajan"];

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
