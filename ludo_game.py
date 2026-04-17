import pygame
import sys
import math
import random
import time
from pygame import gfxdraw

# Initialize pygame
pygame.init()
pygame.mixer.init()

# Screen dimensions
SCREEN_W, SCREEN_H = 480, 720
screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
pygame.display.set_caption("Ludo Game")

# Colors
BG_COLOR = (88, 44, 88)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GREEN = (76, 153, 0)
YELLOW = (204, 163, 0)
RED = (192, 57, 43)
BLUE = (41, 128, 185)
LIGHT_GREEN = (144, 238, 144)
LIGHT_YELLOW = (255, 255, 153)
LIGHT_RED = (255, 153, 153)
LIGHT_BLUE = (153, 204, 255)
GOLD = (212, 175, 55)
DARK_GOLD = (150, 120, 30)
GRAY = (200, 200, 200)
DARK_GRAY = (100, 100, 100)
ORANGE = (230, 126, 34)
PURPLE = (142, 68, 173)
PINK = (255, 105, 180)
CYAN = (0, 255, 255)

# Fonts
font_small = pygame.font.SysFont("Arial", 12, bold=True)
font_med = pygame.font.SysFont("Arial", 16, bold=True)
font_large = pygame.font.SysFont("Arial", 22, bold=True)
font_xlarge = pygame.font.SysFont("Arial", 30, bold=True)
font_emoji = pygame.font.SysFont("Segoe UI Emoji", 18)

# Board position
BOARD_X = 15
BOARD_Y = 115
BOARD_SIZE = 450
CELL = BOARD_SIZE // 15

# Player colors
PLAYER_COLORS = [GREEN, YELLOW, RED, BLUE]
PLAYER_LIGHT = [LIGHT_GREEN, LIGHT_YELLOW, LIGHT_RED, LIGHT_BLUE]
PLAYER_NAMES = ["Shivali Mahajan", "Sachin Kumar Sh", "Govind", "Thiago Rodigues"]

# Token positions (home positions for each player)
HOME_POSITIONS = {
    0: [(2, 2), (4, 2), (2, 4), (4, 4)],  # Green
    1: [(10, 2), (12, 2), (10, 4), (12, 4)],  # Yellow
    2: [(2, 10), (4, 10), (2, 12), (4, 12)],  # Red
    3: [(10, 10), (12, 10), (10, 12), (12, 12)],  # Blue
}


class DiceAnimation:
    def __init__(self):
        self.value = 1
        self.rolling = False
        self.roll_frames = 0
        self.roll_max = 20
        self.display_value = 1
        self.angle = 0

    def roll(self):
        self.rolling = True
        self.roll_frames = 0
        self.value = random.randint(1, 6)

    def update(self):
        if self.rolling:
            self.roll_frames += 1
            self.display_value = random.randint(1, 6)
            self.angle += 15
            if self.roll_frames >= self.roll_max:
                self.rolling = False
                self.display_value = self.value
                self.angle = 0

    def draw(self, surface, x, y, size=55):
        val = self.display_value if self.rolling else self.value
        # Shadow
        shadow_rect = pygame.Rect(x + 4, y + 4, size, size)
        pygame.draw.rect(surface, (40, 20, 40), shadow_rect, border_radius=12)
        # Dice body
        rect = pygame.Rect(x, y, size, size)
        pygame.draw.rect(surface, WHITE, rect, border_radius=12)
        pygame.draw.rect(surface, DARK_GRAY, rect, 3, border_radius=12)
        # Dots
        dot_positions = {
            1: [(0.5, 0.5)],
            2: [(0.25, 0.25), (0.75, 0.75)],
            3: [(0.25, 0.25), (0.5, 0.5), (0.75, 0.75)],
            4: [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)],
            5: [(0.25, 0.25), (0.75, 0.25), (0.5, 0.5), (0.25, 0.75), (0.75, 0.75)],
            6: [
                (0.25, 0.2),
                (0.75, 0.2),
                (0.25, 0.5),
                (0.75, 0.5),
                (0.25, 0.8),
                (0.75, 0.8),
            ],
        }
        for dx, dy in dot_positions.get(val, []):
            dot_x = int(x + dx * size)
            dot_y = int(y + dy * size)
            pygame.draw.circle(surface, BLACK, (dot_x, dot_y), size // 9)
            pygame.draw.circle(surface, DARK_GRAY, (dot_x, dot_y), size // 9, 1)


class Token:
    def __init__(self, player, index, pos):
        self.player = player
        self.index = index
        self.grid_pos = pos
        self.steps = 0
        self.finished = False
        self.in_home = True
        self.px = 0
        self.py = 0
        self.animating = False
        self.anim_target = None
        self.selected = False
        self.pulse = 0

    def update(self):
        self.pulse += 0.1
        if self.animating and self.anim_target:
            dx = self.anim_target[0] - self.px
            dy = self.anim_target[1] - self.py
            dist = math.sqrt(dx * dx + dy * dy)
            if dist < 3:
                self.px, self.py = self.anim_target
                self.animating = False
                self.anim_target = None
            else:
                self.px += dx * 0.2
                self.py += dy * 0.2

    def draw(self, surface, x, y, radius=14):
        # Token shadow
        pygame.draw.circle(surface, (20, 10, 20), (int(x + 2), int(y + 2)), radius)
        # Token outer ring (gold)
        pygame.draw.circle(surface, GOLD, (int(x), int(y)), radius)
        # Token inner
        color = PLAYER_COLORS[self.player]
        pygame.draw.circle(surface, color, (int(x), int(y)), radius - 3)
        # Token center
        dark_color = tuple(max(0, c - 60) for c in color)
        pygame.draw.circle(surface, dark_color, (int(x), int(y)), radius - 7)
        # Selection glow
        if self.selected:
            pulse_r = int(radius + 4 + math.sin(self.pulse) * 3)
            glow_surf = pygame.Surface(
                (pulse_r * 2 + 4, pulse_r * 2 + 4), pygame.SRCALPHA
            )
            pygame.draw.circle(
                glow_surf, (255, 255, 255, 100), (pulse_r + 2, pulse_r + 2), pulse_r
            )
            surface.blit(glow_surf, (int(x) - pulse_r - 2, int(y) - pulse_r - 2))
        # Highlight
        pygame.draw.circle(surface, WHITE, (int(x) - 3, int(y) - 3), 4)


class ChatSystem:
    def __init__(self):
        self.messages = [
            ("Govind", "Let's play!", GREEN),
            ("Sachin Kumar Sh", "Ready!", YELLOW),
        ]
        self.input_text = ""
        self.active = False
        self.visible = False
        self.emojis = ["😀", "😂", "😎", "🎲", "🏆", "👍", "❤️", "🔥", "😡", "😢"]
        self.emoji_visible = False
        self.scroll = 0

    def add_message(self, sender, text, color):
        self.messages.append((sender, text, color))
        if len(self.messages) > 20:
            self.messages.pop(0)

    def draw(self, surface, x, y, w, h):
        if not self.visible:
            return
        # Chat panel
        panel = pygame.Surface((w, h), pygame.SRCALPHA)
        panel.fill((30, 15, 40, 220))
        surface.blit(panel, (x, y))
        pygame.draw.rect(surface, PURPLE, (x, y, w, h), 2, border_radius=10)

        # Messages
        msg_y = y + 10
        for sender, msg, color in self.messages[-6:]:
            name_surf = font_small.render(f"{sender}:", True, color)
            surface.blit(name_surf, (x + 8, msg_y))
            msg_surf = font_small.render(msg, True, WHITE)
            surface.blit(msg_surf, (x + 8, msg_y + 14))
            msg_y += 30

        # Input box
        input_rect = pygame.Rect(x + 5, y + h - 28, w - 10, 22)
        pygame.draw.rect(surface, WHITE, input_rect, border_radius=5)
        pygame.draw.rect(surface, PURPLE, input_rect, 2, border_radius=5)
        input_surf = font_small.render(
            self.input_text + ("|" if self.active else ""), True, BLACK
        )
        surface.blit(input_surf, (input_rect.x + 4, input_rect.y + 3))


class EmojiPanel:
    def __init__(self):
        self.emojis = [
            "😀",
            "😂",
            "😎",
            "🎲",
            "🏆",
            "👍",
            "❤️",
            "🔥",
            "😡",
            "😢",
            "🎉",
            "👑",
            "💪",
            "🤣",
            "😤",
            "🥳",
            "😱",
            "🤩",
            "😴",
            "🤔",
        ]
        self.visible = False
        self.selected = None
        self.display_timer = 0
        self.display_emoji = None
        self.display_pos = (240, 300)

    def draw(self, surface, x, y):
        if not self.visible:
            return
        w, h = 300, 100
        panel = pygame.Surface((w, h), pygame.SRCALPHA)
        panel.fill((40, 20, 60, 230))
        surface.blit(panel, (x, y))
        pygame.draw.rect(surface, GOLD, (x, y, w, h), 2, border_radius=10)

        for i, emoji in enumerate(self.emojis[:10]):
            ex = x + 15 + (i % 5) * 56
            ey = y + 15 + (i // 5) * 45
            try:
                e_surf = font_emoji.render(emoji, True, WHITE)
                surface.blit(e_surf, (ex, ey))
            except:
                e_surf = font_small.render(emoji, True, WHITE)
                surface.blit(e_surf, (ex, ey))

    def draw_floating(self, surface):
        if self.display_emoji and self.display_timer > 0:
            self.display_timer -= 1
            alpha = min(255, self.display_timer * 5)
            try:
                font_big_emoji = pygame.font.SysFont("Segoe UI Emoji", 50)
                e_surf = font_big_emoji.render(self.display_emoji, True, WHITE)
                e_surf.set_alpha(alpha)
                surface.blit(e_surf, self.display_pos)
            except:
                pass


class ProfileAvatar:
    def __init__(self, name, color, position, size=50):
        self.name = name
        self.color = color
        self.position = position
        self.size = size
        self.pulse = 0
        self.active = False
        self.initials = name[:2].upper()
        self.speaking = False
        self.speak_timer = 0

    def update(self):
        self.pulse += 0.05
        if self.speak_timer > 0:
            self.speak_timer -= 1
            self.speaking = True
        else:
            self.speaking = False

    def draw(self, surface):
        x, y = self.position
        r = self.size // 2

        # Active glow
        if self.active:
            for i in range(5, 0, -1):
                glow_surf = pygame.Surface(
                    (r * 2 + i * 6, r * 2 + i * 6), pygame.SRCALPHA
                )
                alpha = int(50 - i * 8)
                pygame.draw.circle(
                    glow_surf, (*self.color, alpha), (r + i * 3, r + i * 3), r + i * 3
                )
                surface.blit(glow_surf, (x - r - i * 3, y - r - i * 3))

        # Avatar background
        pygame.draw.circle(surface, self.color, (x, y), r)
        dark = tuple(max(0, c - 80) for c in self.color)
        pygame.draw.circle(surface, dark, (x, y), r - 5)

        # Initials
        init_surf = font_med.render(self.initials, True, WHITE)
        surface.blit(
            init_surf, (x - init_surf.get_width() // 2, y - init_surf.get_height() // 2)
        )

        # Border ring
        ring_color = WHITE if self.active else GOLD
        pygame.draw.circle(surface, ring_color, (x, y), r, 3)

        # Speaking animation
        if self.speaking:
            for i in range(3):
                pulse_r = r + 5 + i * 6 + int(math.sin(self.pulse * 3 + i) * 3)
                alpha = max(0, 150 - i * 50)
                speak_surf = pygame.Surface(
                    (pulse_r * 2 + 4, pulse_r * 2 + 4), pygame.SRCALPHA
                )
                pygame.draw.circle(
                    speak_surf,
                    (100, 255, 100, alpha),
                    (pulse_r + 2, pulse_r + 2),
                    pulse_r,
                    2,
                )
                surface.blit(speak_surf, (x - pulse_r - 2, y - pulse_r - 2))

        # Name label
        name_surf = font_small.render(self.name[:14], True, WHITE)
        surface.blit(name_surf, (x - name_surf.get_width() // 2, y + r + 3))


class MicButton:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.active = False
        self.pulse = 0
        self.size = 30

    def update(self):
        self.pulse += 0.1

    def draw(self, surface):
        # Background
        color = RED if self.active else DARK_GRAY
        pygame.draw.circle(surface, color, (self.x, self.y), self.size // 2)
        pygame.draw.circle(surface, WHITE, (self.x, self.y), self.size // 2, 2)

        # Mic icon
        mic_w, mic_h = 8, 14
        mic_rect = pygame.Rect(self.x - mic_w // 2, self.y - mic_h // 2, mic_w, mic_h)
        pygame.draw.rect(surface, WHITE, mic_rect, border_radius=4)
        # Mic stand
        pygame.draw.arc(
            surface, WHITE, (self.x - 8, self.y - 2, 16, 12), math.pi, 2 * math.pi, 2
        )
        pygame.draw.line(surface, WHITE, (self.x, self.y + 4), (self.x, self.y + 8), 2)
        pygame.draw.line(
            surface, WHITE, (self.x - 5, self.y + 8), (self.x + 5, self.y + 8), 2
        )

        if self.active:
            for i in range(3):
                r = self.size // 2 + 5 + i * 7
                alpha = int(120 - i * 40 + math.sin(self.pulse + i) * 30)
                pulse_surf = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
                pygame.draw.circle(pulse_surf, (255, 100, 100, alpha), (r, r), r, 2)
                surface.blit(pulse_surf, (self.x - r, self.y - r))

    def handle_click(self, pos):
        dx = pos[0] - self.x
        dy = pos[1] - self.y
        if math.sqrt(dx * dx + dy * dy) <= self.size // 2:
            self.active = not self.active
            return True
        return False


class LudoGame:
    def __init__(self):
        self.board_x = BOARD_X
        self.board_y = BOARD_Y
        self.board_size = BOARD_SIZE
        self.cell = BOARD_SIZE // 15

        self.dice = DiceAnimation()
        self.current_player = 0
        self.tokens = []
        self.game_state = "roll"  # roll, move, animate
        self.turn_arrow_pulse = 0
        self.winner = None
        self.dice_rolled = False
        self.last_roll = 0

        self.chat = ChatSystem()
        self.emoji_panel = EmojiPanel()

        # Initialize tokens
        for p in range(4):
            player_tokens = []
            for i, pos in enumerate(HOME_POSITIONS[p]):
                t = Token(p, i, pos)
                player_tokens.append(t)
            self.tokens.append(player_tokens)

        # Avatars
        self.avatars = [
            ProfileAvatar(PLAYER_NAMES[0], GREEN, (35, 60)),
            ProfileAvatar(PLAYER_NAMES[1], YELLOW, (440, 60)),
            ProfileAvatar(PLAYER_NAMES[2], RED, (35, 640)),
            ProfileAvatar(PLAYER_NAMES[3], BLUE, (440, 640)),
        ]
        self.avatars[0].active = True

        # Mic buttons
        self.mic_buttons = [
            MicButton(70, 640),
            MicButton(408, 640),
        ]

        # UI elements
        self.dice_button_rect = pygame.Rect(175, 615, 60, 60)
        self.undo_button_rect = pygame.Rect(200, 620, 40, 40)
        self.emoji_btn_rect = pygame.Rect(35, 680, 80, 28)
        self.chat_btn_rect = pygame.Rect(130, 680, 80, 28)

        # Star positions on board
        self.star_cells = [
            (8, 2),
            (6, 2),
            (2, 6),
            (2, 8),
            (6, 12),
            (8, 12),
            (12, 6),
            (12, 8),
        ]

        # Animation
        self.timer = 0
        self.particles = []

        # Turn indicator arrow
        self.arrow_y_offset = 0
        self.arrow_dir = 1

        # Safe positions
        self.safe_positions = [
            (1, 6),
            (2, 8),
            (6, 13),
            (8, 12),
            (13, 8),
            (12, 6),
            (8, 1),
            (6, 2),
        ]

        # Score tracking
        self.scores = [0, 0, 0, 0]
        self.move_count = 3

    def get_cell_pixel(self, gx, gy):
        px = self.board_x + gx * self.cell + self.cell // 2
        py = self.board_y + gy * self.cell + self.cell // 2
        return px, py

    def draw_board(self, surface):
        # Board background
        board_rect = pygame.Rect(
            self.board_x - 5,
            self.board_y - 5,
            self.board_size + 10,
            self.board_size + 10,
        )
        pygame.draw.rect(surface, DARK_GOLD, board_rect, border_radius=15)
        pygame.draw.rect(surface, self.board_x, board_rect, 4, border_radius=15)

        # Main board
        main_rect = pygame.Rect(
            self.board_x, self.board_y, self.board_size, self.board_size
        )
        pygame.draw.rect(surface, WHITE, main_rect)

        # Draw grid cells
        for row in range(15):
            for col in range(15):
                rx = self.board_x + col * self.cell
                ry = self.board_y + row * self.cell
                cell_rect = pygame.Rect(rx, ry, self.cell, self.cell)

                # Determine cell color
                color = WHITE

                # Home areas
                if 0 <= col <= 5 and 0 <= row <= 5:
                    color = (
                        LIGHT_GREEN
                        if (col <= 1 or col >= 4 or row <= 1 or row >= 4)
                        else GREEN
                    )
                    if 1 <= col <= 4 and 1 <= row <= 4:
                        color = LIGHT_GREEN
                elif 9 <= col <= 14 and 0 <= row <= 5:
                    color = (
                        LIGHT_YELLOW
                        if (col <= 10 or col >= 13 or row <= 1 or row >= 4)
                        else YELLOW
                    )
                    if 10 <= col <= 13 and 1 <= row <= 4:
                        color = LIGHT_YELLOW
                elif 0 <= col <= 5 and 9 <= row <= 14:
                    color = LIGHT_RED
                    if 1 <= col <= 4 and 10 <= row <= 13:
                        color = LIGHT_RED
                elif 9 <= col <= 14 and 9 <= row <= 14:
                    color = LIGHT_BLUE
                    if 10 <= col <= 13 and 10 <= row <= 13:
                        color = LIGHT_BLUE
                # Colored paths
                elif col == 7 and 1 <= row <= 5:
                    color = (100, 200, 100)
                elif col == 7 and 9 <= row <= 13:
                    color = (255, 100, 100)
                elif row == 7 and 1 <= col <= 5:
                    color = (255, 100, 100)
                elif row == 7 and 9 <= col <= 13:
                    color = (100, 150, 255)
                elif col == 1 and 6 <= row <= 8:
                    color = LIGHT_RED
                elif col == 13 and 6 <= row <= 8:
                    color = LIGHT_BLUE
                elif row == 1 and 6 <= col <= 8:
                    color = LIGHT_GREEN
                elif row == 13 and 6 <= col <= 8:
                    color = LIGHT_RED

                pygame.draw.rect(surface, color, cell_rect)
                pygame.draw.rect(surface, DARK_GRAY, cell_rect, 1)

        # Draw home areas (large colored squares)
        self.draw_home_area(surface, self.board_x, self.board_y, GREEN, 0)
        self.draw_home_area(
            surface, self.board_x + 9 * self.cell, self.board_y, YELLOW, 1
        )
        self.draw_home_area(surface, self.board_x, self.board_y + 9 * self.cell, RED, 2)
        self.draw_home_area(
            surface, self.board_x + 9 * self.cell, self.board_y + 9 * self.cell, BLUE, 3
        )

        # Draw center triangle area
        self.draw_center(surface)

        # Draw stars
        self.draw_stars(surface)

        # Board border
        pygame.draw.rect(surface, DARK_GOLD, main_rect, 3)

    def draw_home_area(self, surface, x, y, color, player):
        # Outer home square
        outer_rect = pygame.Rect(x, y, 6 * self.cell, 6 * self.cell)
        pygame.draw.rect(surface, color, outer_rect, border_radius=8)

        # Inner white square
        margin = self.cell
        inner_rect = pygame.Rect(x + margin, y + margin, 4 * self.cell, 4 * self.cell)
        pygame.draw.rect(surface, WHITE, inner_rect, border_radius=5)

        # Inner colored square
        margin2 = int(self.cell * 0.2)
        inner2_rect = pygame.Rect(
            x + margin + margin2,
            y + margin + margin2,
            4 * self.cell - margin2 * 2,
            4 * self.cell - margin2 * 2,
        )
        light = PLAYER_LIGHT[player]
        pygame.draw.rect(surface, light, inner2_rect, border_radius=5)

        # Pattern circles in home
        cx = x + 3 * self.cell
        cy = y + 3 * self.cell
        pygame.draw.circle(surface, color, (cx, cy), self.cell // 2, 3)

        # Home token spots
        positions = [
            (x + int(1.7 * self.cell), y + int(1.7 * self.cell)),
            (x + int(4.3 * self.cell), y + int(1.7 * self.cell)),
            (x + int(1.7 * self.cell), y + int(4.3 * self.cell)),
            (x + int(4.3 * self.cell), y + int(4.3 * self.cell)),
        ]
        for px, py in positions:
            pygame.draw.circle(surface, WHITE, (px, py), self.cell // 2 - 2)
            pygame.draw.circle(surface, color, (px, py), self.cell // 2 - 5)
            pygame.draw.circle(surface, WHITE, (px, py), self.cell // 4)

    def draw_center(self, surface):
        cx = self.board_x + 7.5 * self.cell
        cy = self.board_y + 7.5 * self.cell
        s = self.cell * 3

        # Center square
        center_rect = pygame.Rect(int(cx - s // 2), int(cy - s // 2), s, s)
        pygame.draw.rect(surface, WHITE, center_rect)

        # Draw 4 triangles
        triangles = [
            # Green (top)
            [(cx, cy), (cx - s // 2, cy - s // 2), (cx + s // 2, cy - s // 2)],
            # Yellow (right)
            [(cx, cy), (cx + s // 2, cy - s // 2), (cx + s // 2, cy + s // 2)],
            # Blue (bottom)
            [(cx, cy), (cx - s // 2, cy + s // 2), (cx + s // 2, cy + s // 2)],
            # Red (left)
            [(cx, cy), (cx - s // 2, cy - s // 2), (cx - s // 2, cy + s // 2)],
        ]
        tri_colors = [GREEN, YELLOW, BLUE, RED]
        for tri, color in zip(triangles, tri_colors):
            pts = [(int(p[0]), int(p[1])) for p in tri]
            pygame.draw.polygon(surface, color, pts)
            pygame.draw.polygon(surface, WHITE, pts, 1)

        # Center star/circle
        pygame.draw.circle(surface, WHITE, (int(cx), int(cy)), self.cell // 2)
        pygame.draw.circle(surface, GOLD, (int(cx), int(cy)), self.cell // 2 - 3)

    def draw_stars(self, surface):
        star_pos = [
            (6, 2),
            (8, 2),
            (2, 6),
            (2, 8),
            (6, 12),
            (8, 12),
            (12, 6),
            (12, 8),
        ]
        for col, row in star_pos:
            px = self.board_x + col * self.cell + self.cell // 2
            py = self.board_y + row * self.cell + self.cell // 2
            self.draw_star_shape(surface, px, py, 8, 5, GOLD)

    def draw_star_shape(self, surface, x, y, outer_r, inner_r, color):
        points = []
        for i in range(10):
            angle = math.pi / 5 * i - math.pi / 2
            r = outer_r if i % 2 == 0 else inner_r
            points.append((x + r * math.cos(angle), y + r * math.sin(angle)))
        pygame.draw.polygon(surface, color, points)
        pygame.draw.polygon(surface, WHITE, points, 1)

    def draw_tokens(self, surface):
        for p in range(4):
            for i, token in enumerate(self.tokens[p]):
                if token.in_home:
                    home_pos = HOME_POSITIONS[p][i]
                    px, py = self.get_cell_pixel(home_pos[0], home_pos[1])
                else:
                    px, py = self.get_cell_pixel(token.grid_pos[0], token.grid_pos[1])
                token.draw(surface, px, py)

    def draw_turn_indicator(self, surface):
        self.turn_arrow_pulse += 0.05
        self.arrow_y_offset = math.sin(self.turn_arrow_pulse) * 5

        player = self.current_player
        arrow_x = SCREEN_W // 2
        arrow_y = int(self.board_y + self.board_size + 10 + self.arrow_y_offset)

        # Arrow down
        pts = [
            (arrow_x, arrow_y + 20),
            (arrow_x - 12, arrow_y),
            (arrow_x + 12, arrow_y),
        ]
        pygame.draw.polygon(surface, PLAYER_COLORS[player], pts)
        pygame.draw.polygon(surface, WHITE, pts, 2)

        # Turn text
        turn_text = font_small.render(f"{PLAYER_NAMES[player]}'s Turn", True, WHITE)
        surface.blit(turn_text, (arrow_x - turn_text.get_width() // 2, arrow_y - 18))

    def draw_dice_area(self, surface):
        # Dice area background
        dice_area = pygame.Rect(100, 605, 280, 75)
        pygame.draw.rect(surface, (60, 30, 70), dice_area, border_radius=15)
        pygame.draw.rect(surface, GOLD, dice_area, 2, border_radius=15)

        # Dice button
        self.dice.draw(surface, 148, 613)

        # Undo button
        undo_rect = pygame.Rect(215, 618, 45, 45)
        pygame.draw.rect(surface, DARK_GRAY, undo_rect, border_radius=10)
        pygame.draw.rect(surface, WHITE, undo_rect, 2, border_radius=10)
        undo_text = font_med.render("↺", True, WHITE)
        surface.blit(undo_text, (undo_rect.x + 12, undo_rect.y + 8))

        # Move count indicator
        count_text = font_small.render(str(self.move_count), True, GOLD)
        surface.blit(count_text, (220, 665))

        # Crown/roll button
        crown_rect = pygame.Rect(272, 613, 55, 55)
        color = RED if self.game_state == "roll" else DARK_GRAY
        pygame.draw.rect(surface, color, crown_rect, border_radius=10)
        pygame.draw.rect(surface, WHITE, crown_rect, 2, border_radius=10)
        crown_text = font_xlarge.render("♛", True, GOLD)
        surface.blit(crown_text, (crown_rect.x + 8, crown_rect.y + 5))

    def draw_bottom_bar(self, surface):
        # Bottom bar
        bar_rect = pygame.Rect(0, 675, SCREEN_W, 45)
        pygame.draw.rect(surface, (50, 25, 60), bar_rect)
        pygame.draw.rect(surface, PURPLE, bar_rect, 2)

        # Emoji button
        emoji_rect = pygame.Rect(25, 682, 85, 30)
        pygame.draw.rect(surface, (80, 40, 100), emoji_rect, border_radius=8)
        pygame.draw.rect(surface, GOLD, emoji_rect, 2, border_radius=8)
        e_text = font_med.render("EMOJI", True, WHITE)
        surface.blit(e_text, (emoji_rect.x + 12, emoji_rect.y + 6))

        # Chat button
        chat_rect = pygame.Rect(125, 682, 80, 30)
        pygame.draw.rect(surface, (80, 40, 100), chat_rect, border_radius=8)
        pygame.draw.rect(surface, GOLD, chat_rect, 2, border_radius=8)
        c_text = font_med.render("CHAT", True, WHITE)
        surface.blit(c_text, (chat_rect.x + 14, chat_rect.y + 6))

    def draw_particles(self, surface):
        for p in self.particles[:]:
            p["life"] -= 1
            p["x"] += p["vx"]
            p["y"] += p["vy"]
            p["vy"] += 0.2
            if p["life"] <= 0:
                self.particles.remove(p)
                continue
            alpha = int(255 * p["life"] / p["max_life"])
            color = (*p["color"], alpha)
            ps = pygame.Surface((p["size"] * 2, p["size"] * 2), pygame.SRCALPHA)
            pygame.draw.circle(ps, color, (p["size"], p["size"]), p["size"])
            surface.blit(ps, (int(p["x"]) - p["size"], int(p["y"]) - p["size"]))

    def spawn_particles(self, x, y, color, count=20):
        for _ in range(count):
            self.particles.append(
                {
                    "x": x,
                    "y": y,
                    "vx": random.uniform(-4, 4),
                    "vy": random.uniform(-6, -1),
                    "color": color,
                    "life": random.randint(20, 50),
                    "max_life": 50,
                    "size": random.randint(3, 8),
                }
            )

    def draw_ui_overlays(self, surface):
        # Game title area
        title_bg = pygame.Rect(0, 0, SCREEN_W, 110)
        pygame.draw.rect(surface, (70, 35, 80), title_bg)
        pygame.draw.rect(surface, PURPLE, pygame.Rect(0, 108, SCREEN_W, 2))

        # Player avatars top
        self.avatars[0].draw(surface)
        self.avatars[1].draw(surface)

        # Player avatars bottom
        self.avatars[2].draw(surface)
        self.avatars[3].draw(surface)

        # Mic buttons
        for mic in self.mic_buttons:
            mic.draw(surface)

        # Score displays
        for i, score in enumerate(self.scores):
            if i < 2:
                x = 80 + i * 295
                y = 88
            else:
                x = 80 + (i - 2) * 295
                y = 605

            score_surf = font_small.render(f"Score: {score}", True, GOLD)
            # surface.blit(score_surf, (x, y))

    def draw_winner_screen(self, surface):
        if self.winner is not None:
            overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 180))
            surface.blit(overlay, (0, 0))

            # Winner panel
            panel_rect = pygame.Rect(80, 200, 320, 300)
            pygame.draw.rect(surface, (60, 20, 80), panel_rect, border_radius=20)
            pygame.draw.rect(surface, GOLD, panel_rect, 4, border_radius=20)

            trophy = font_xlarge.render("🏆", True, GOLD)
            surface.blit(trophy, (SCREEN_W // 2 - 20, 220))

            win_text = font_large.render("WINNER!", True, GOLD)
            surface.blit(win_text, (SCREEN_W // 2 - win_text.get_width() // 2, 290))

            name_text = font_med.render(PLAYER_NAMES[self.winner], True, WHITE)
            surface.blit(name_text, (SCREEN_W // 2 - name_text.get_width() // 2, 330))

            # Restart button
            restart_rect = pygame.Rect(160, 420, 160, 45)
            pygame.draw.rect(surface, GREEN, restart_rect, border_radius=12)
            r_text = font_med.render("Play Again", True, WHITE)
            surface.blit(r_text, (SCREEN_W // 2 - r_text.get_width() // 2, 432))

    def update(self):
        self.timer += 1
        self.dice.update()
        for avatar in self.avatars:
            avatar.update()
        for mic in self.mic_buttons:
            mic.update()
        for player_tokens in self.tokens:
            for token in player_tokens:
                token.update()

    def roll_dice(self):
        if self.game_state == "roll" and not self.dice.rolling:
            self.dice.roll()
            self.dice_rolled = True
            self.last_roll = self.dice.value
            self.game_state = "move"
            self.avatars[self.current_player].speak_timer = 60
            self.chat.add_message(
                PLAYER_NAMES[self.current_player],
                f"Rolled {self.dice.value}!",
                PLAYER_COLORS[self.current_player],
            )

    def next_turn(self):
        self.current_player = (self.current_player + 1) % 4
        self.game_state = "roll"
        self.dice_rolled = False
        for i, avatar in enumerate(self.avatars):
            avatar.active = i == self.current_player

    def handle_token_click(self, pos):
        if self.game_state != "move":
            return
        for i, token in enumerate(self.tokens[self.current_player]):
            if token.in_home:
                home_pos = HOME_POSITIONS[self.current_player][i]
                px, py = self.get_cell_pixel(home_pos[0], home_pos[1])
            else:
                px, py = self.get_cell_pixel(token.grid_pos[0], token.grid_pos[1])

            dx = pos[0] - px
            dy = pos[1] - py
            if math.sqrt(dx * dx + dy * dy) < self.cell:
                token.selected = True
                # Move token
                if token.in_home and self.last_roll == 6:
                    token.in_home = False
                    token.steps = 1
                    spawn_x, spawn_y = self.get_cell_pixel(
                        token.grid_pos[0], token.grid_pos[1]
                    )
                    self.spawn_particles(
                        spawn_x, spawn_y, PLAYER_COLORS[self.current_player]
                    )
                    self.scores[self.current_player] += 10
                elif not token.in_home:
                    token.steps += self.last_roll
                    if token.steps >= 57:
                        token.finished = True
                        self.scores[self.current_player] += 50
                        self.spawn_particles(px, py, GOLD, 30)
                self.next_turn()
                break

    def draw(self, surface):
        # Background
        surface.fill(BG_COLOR)

        # Draw board
        self.draw_board(surface)

        # Draw tokens
        self.draw_tokens(surface)

        # Draw turn indicator
        self.draw_turn_indicator(surface)

        # Draw dice area
        self.draw_dice_area(surface)

        # Draw bottom bar
        self.draw_bottom_bar(surface)

        # Draw UI overlays
        self.draw_ui_overlays(surface)

        # Draw particles
        self.draw_particles(surface)

        # Chat panel
        if self.chat.visible:
            self.chat.draw(surface, 10, 420, 300, 180)

        # Emoji panel
        if self.emoji_panel.visible:
            self.emoji_panel.draw(surface, 60, 560)

        self.emoji_panel.draw_floating(surface)

        # Winner screen
        if self.winner is not None:
            self.draw_winner_screen(surface)

        # Decorative corner elements
        self.draw_decorations(surface)

    def draw_decorations(self, surface):
        # Top decorative dots
        for i in range(5):
            x = 160 + i * 35
            pygame.draw.circle(surface, PURPLE, (x, 8), 3)

        # Side decorative lines
        pygame.draw.line(surface, PURPLE, (5, 110), (5, SCREEN_H - 50), 2)
        pygame.draw.line(
            surface, PURPLE, (SCREEN_W - 5, 110), (SCREEN_W - 5, SCREEN_H - 50), 2
        )


def main():
    clock = pygame.time.Clock()
    game = LudoGame()

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
                break

            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    game.roll_dice()
                elif game.chat.active:
                    if event.key == pygame.K_RETURN:
                        if game.chat.input_text:
                            game.chat.add_message(
                                PLAYER_NAMES[game.current_player],
                                game.chat.input_text,
                                PLAYER_COLORS[game.current_player],
                            )
                            game.chat.input_text = ""
                    elif event.key == pygame.K_BACKSPACE:
                        game.chat.input_text = game.chat.input_text[:-1]
                    else:
                        game.chat.input_text += event.unicode

            if event.type == pygame.MOUSEBUTTONDOWN:
                pos = event.pos

                # Dice click
                if 148 <= pos[0] <= 148 + 55 and 613 <= pos[1] <= 613 + 55:
                    game.roll_dice()

                # Crown/action button
                if 272 <= pos[0] <= 327 and 613 <= pos[1] <= 668:
                    game.roll_dice()

                # Token click
                game.handle_token_click(pos)

                # Emoji button
                if 25 <= pos[0] <= 110 and 682 <= pos[1] <= 712:
                    game.emoji_panel.visible = not game.emoji_panel.visible
                    game.chat.visible = False

                # Chat button
                if 125 <= pos[0] <= 205 and 682 <= pos[1] <= 712:
                    game.chat.visible = not game.chat.visible
                    game.emoji_panel.visible = False
                    game.chat.active = game.chat.visible

                # Emoji panel click
                if game.emoji_panel.visible:
                    ex_base, ey_base = 60, 560
                    for i in range(10):
                        ex = ex_base + 15 + (i % 5) * 56
                        ey = ey_base + 15 + (i // 5) * 45
                        if abs(pos[0] - ex) < 22 and abs(pos[1] - ey) < 22:
                            game.emoji_panel.display_emoji = game.emoji_panel.emojis[i]
                            game.emoji_panel.display_timer = 90
                            game.emoji_panel.display_pos = (200, 350)
                            game.emoji_panel.visible = False
                            game.chat.add_message(
                                PLAYER_NAMES[game.current_player],
                                game.emoji_panel.emojis[i],
                                PLAYER_COLORS[game.current_player],
                            )

                # Mic buttons
                for mic in game.mic_buttons:
                    mic.handle_click(pos)

                # Winner restart
                if game.winner is not None:
                    if 160 <= pos[0] <= 320 and 420 <= pos[1] <= 465:
                        game = LudoGame()

        game.update()
        game.draw(screen)
        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()
