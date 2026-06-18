import math
import random
import sys
from pathlib import Path

import pygame


BASE_DIR = Path(__file__).resolve().parent
ART_DIR = BASE_DIR / "artes"

WIDTH, HEIGHT = 1280, 720
FPS = 60

GRAVITY = 0.75
PLAYER_SPEED = 6
JUMP_SPEED = -15
PLAYER_HP_MAX = 100
PLAYER_LIVES_MAX = 10

NIGHT = (11, 16, 31)
DAY = (120, 190, 230)
GROUND = (55, 77, 45)
PLATFORM = (78, 88, 65)
BLOOD = (135, 22, 27)
WHITE = (235, 241, 245)
YELLOW = (248, 216, 80)
RED = (235, 54, 54)
GREEN = (70, 220, 130)
CYAN = (72, 210, 245)
PURPLE = (170, 92, 255)
BLACK = (0, 0, 0)


def load_image(name, size=None):
    path = ART_DIR / name
    try:
        image = pygame.image.load(path).convert_alpha()
    except pygame.error:
        image = pygame.Surface(size or (32, 32), pygame.SRCALPHA)
        image.fill((255, 0, 255))
    if size:
        image = pygame.transform.smoothscale(image, size)
    return image


def draw_text(surface, font, text, x, y, color=WHITE, center=False):
    rendered = font.render(text, True, color)
    rect = rendered.get_rect()
    if center:
        rect.center = (x, y)
    else:
        rect.topleft = (x, y)
    surface.blit(rendered, rect)
    return rect


def clamp(value, low, high):
    return max(low, min(high, value))


class Platform:
    def __init__(self, x, y, w, h):
        self.rect = pygame.Rect(x, y, w, h)

    def draw(self, surface, camera_x):
        rect = self.rect.move(-camera_x, 0)
        pygame.draw.rect(surface, PLATFORM, rect, border_radius=4)
        pygame.draw.rect(surface, (35, 47, 35), rect, 2, border_radius=4)


class Bullet:
    def __init__(self, x, y, target, damage, speed, color, radius=6, blast=0):
        dx = target[0] - x
        dy = target[1] - y
        length = max(1, math.hypot(dx, dy))
        self.x = x
        self.y = y
        self.vx = dx / length * speed
        self.vy = dy / length * speed
        self.damage = damage
        self.color = color
        self.radius = radius
        self.blast = blast
        self.life = 130

    @property
    def rect(self):
        return pygame.Rect(int(self.x - self.radius), int(self.y - self.radius), self.radius * 2, self.radius * 2)

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.life -= 1

    def draw(self, surface, camera_x):
        pygame.draw.circle(surface, self.color, (int(self.x - camera_x), int(self.y)), self.radius)


class Enemy:
    def __init__(self, x, y, image, npc_image, level):
        self.rect = pygame.Rect(x, y, 42, 58)
        self.start_x = x
        self.image = image
        self.npc_image = npc_image
        self.hp = 5  # Herobrines com apenas 5 de vida
        self.cured = False
        self.direction = random.choice([-1, 1])
        self.speed = 1.2 + min(2.4, level * 0.12)
        self.hit_timer = 0

    def update(self, platforms):
        if self.cured:
            return
        self.rect.x += int(self.direction * self.speed)
        if abs(self.rect.x - self.start_x) > 170:
            self.direction *= -1
        for platform in platforms:
            if self.rect.colliderect(platform.rect):
                if self.direction > 0:
                    self.rect.right = platform.rect.left
                else:
                    self.rect.left = platform.rect.right
                self.direction *= -1
        self.hit_timer = max(0, self.hit_timer - 1)

    def take_damage(self, damage):
        if self.cured:
            return
        self.hp -= damage
        self.hit_timer = 8
        if self.hp <= 0:
            self.cured = True  # Transforma-se em Steve (npc_image)

    def draw(self, surface, camera_x):
        img = self.npc_image if self.cured else self.image
        surface.blit(img, self.rect.move(-camera_x, 0))
        if self.hit_timer:
            pygame.draw.rect(surface, WHITE, self.rect.move(-camera_x, 0), 2)


class Pickup:
    def __init__(self, x, y, image, kind):
        self.rect = pygame.Rect(x, y, 16, 16)
        self.image = image
        self.kind = kind
        self.taken = False

    def draw(self, surface, camera_x):
        if not self.taken:
            surface.blit(self.image, self.rect.move(-camera_x, 0))


class Crate:
    def __init__(self, x, y):
        self.rect = pygame.Rect(x, y, 42, 42)
        self.opened = False

    def draw(self, surface, camera_x):
        rect = self.rect.move(-camera_x, 0)
        color = (118, 78, 38) if not self.opened else (70, 50, 30)
        pygame.draw.rect(surface, color, rect, border_radius=4)
        pygame.draw.rect(surface, (210, 166, 92), rect, 3, border_radius=4)
        if not self.opened:
            pygame.draw.line(surface, (245, 210, 120), rect.midleft, rect.midright, 3)
            pygame.draw.line(surface, (245, 210, 120), rect.midtop, rect.midbottom, 3)


class Player:
    def __init__(self, image):
        self.image = image
        self.rect = pygame.Rect(90, HEIGHT - 180, 42, 58)
        self.vel = pygame.Vector2(0, 0)
        self.on_ground = False
        self.hp = PLAYER_HP_MAX
        self.lives = PLAYER_LIVES_MAX
        self.has_weapon = False
        self.invuln = 0
        self.facing = 1

    def reset_for_level(self, level):
        self.rect.topleft = (90, HEIGHT - 180 if level < 10 else HEIGHT - 205)
        self.vel.update(0, 0)
        self.hp = PLAYER_HP_MAX
        self.invuln = 90

    def lose_life(self, level):
        self.lives -= 1
        if self.lives <= 0:
            return 1
        return level

    def gain_life(self):
        self.lives = min(self.lives + 1, PLAYER_LIVES_MAX)
        return self.lives

    def update(self, keys, platforms, level_width):
        self.vel.x = 0
        if keys[pygame.K_a] or keys[pygame.K_LEFT]:
            self.vel.x = -PLAYER_SPEED
            self.facing = -1
        if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
            self.vel.x = PLAYER_SPEED
            self.facing = 1
        if (keys[pygame.K_w] or keys[pygame.K_UP] or keys[pygame.K_SPACE]) and self.on_ground:
            self.vel.y = JUMP_SPEED
            self.on_ground = False

        self.vel.y += GRAVITY
        self.vel.y = min(self.vel.y, 18)

        self.rect.x += int(self.vel.x)
        self.rect.x = clamp(self.rect.x, 0, level_width - self.rect.width)
        for platform in platforms:
            if self.rect.colliderect(platform.rect):
                if self.vel.x > 0:
                    self.rect.right = platform.rect.left
                elif self.vel.x < 0:
                    self.rect.left = platform.rect.right

        self.rect.y += int(self.vel.y)
        self.on_ground = False
        for platform in platforms:
            if self.rect.colliderect(platform.rect):
                if self.vel.y > 0:
                    self.rect.bottom = platform.rect.top
                    self.vel.y = 0
                    self.on_ground = True
                elif self.vel.y < 0:
                    self.rect.top = platform.rect.bottom
                    self.vel.y = 0

        self.invuln = max(0, self.invuln - 1)

    def draw(self, surface, camera_x):
        if self.invuln and self.invuln % 10 < 5:
            return
        surface.blit(self.image, self.rect.move(-camera_x, 0))


class Boss:
    def __init__(self, image, level_width):
        self.image = image
        self.rect = pygame.Rect(level_width - 270, HEIGHT - 265, 128, 128)
        self.hp = 2000
        self.max_hp = 2000
        self.state = "idle"
        self.timer = 120
        self.laser_start = self.rect.center
        self.laser_end = (self.rect.centerx - 800, HEIGHT - 200)

    def alive(self):
        return self.hp > 0

    def update(self, player, camera_x):
        if not self.alive():
            return
        # Boss so ataca quando esta no ecra
        boss_on_screen = self.rect.right > camera_x and self.rect.left < camera_x + WIDTH
        if not boss_on_screen:
            return
        self.timer -= 1
        if self.state == "idle" and self.timer <= 0:
            self.state = "warn"
            self.timer = 30
            self.laser_start = self.rect.center
            target_x = player.rect.centerx
            target_y = player.rect.centery
            spread = random.randint(-90, 90)
            self.laser_end = (target_x + spread, target_y)
        elif self.state == "warn" and self.timer <= 0:
            self.state = "fire"
            self.timer = 18
        elif self.state == "fire" and self.timer <= 0:
            self.state = "idle"
            self.timer = random.randint(70, 110)

    def take_damage(self, damage):
        self.hp = max(0, self.hp - damage)

    def laser_hits(self, player):
        if self.state != "fire":
            return False
        px, py = player.rect.center
        ax, ay = self.laser_start
        bx, by = self.laser_end
        abx, aby = bx - ax, by - ay
        apx, apy = px - ax, py - ay
        denom = max(1, abx * abx + aby * aby)
        t = clamp((apx * abx + apy * aby) / denom, 0, 1)
        cx, cy = ax + abx * t, ay + aby * t
        return math.hypot(px - cx, py - cy) < 34

    def draw(self, surface, camera_x):
        if self.alive():
            surface.blit(self.image, self.rect.move(-camera_x, 0))
        if self.state in ("warn", "fire"):
            sx, sy = self.laser_start[0] - camera_x, self.laser_start[1]
            ex, ey = self.laser_end[0] - camera_x, self.laser_end[1]
            layer = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            color = (255, 40, 40, 115) if self.state == "warn" else (255, 0, 0, 235)
            width = 18 if self.state == "warn" else 28
            pygame.draw.line(layer, color, (sx, sy), (ex, ey), width)
            surface.blit(layer, (0, 0))


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Save the Forest")
        self.fullscreen = True
        self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        self.window_size = self.screen.get_size()
        self.canvas = pygame.Surface((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("consolas", 24, bold=True)
        self.small_font = pygame.font.SysFont("consolas", 16, bold=True)
        self.big_font = pygame.font.SysFont("consolas", 54, bold=True)

        self.player_img = load_image("jogador.png", (42, 58))
        self.enemy_img = load_image("inimigo.png", (42, 58))
        self.npc_img = load_image("npc.png", (42, 58))
        self.xp_img = load_image("xp.png", (8, 8))
        self.boss_img = load_image("boss.png", (128, 128))
        self.life_img = load_image("vida.png", (24, 24))
        self.objective_img = load_image("objetivo.png", (40, 40))

        # Fundos PNG
        self.bg_image = load_image("fundo.png", (WIDTH, HEIGHT))  # Noite
        self.bg_vivo = load_image("floresta.png", (WIDTH, HEIGHT))  # Fundo final em imagem unica

        self.player = Player(self.player_img)
        self.level = 1
        self.max_level = 10
        self.level_width = 3600
        self.platforms = []
        self.enemies = []
        self.pickups = []
        self.crate = None
        self.bullets = []
        self.boss = None
        self.boss_room_closed = False
        self.game_won = False
        self.message = ""
        self.message_timer = 0

        self.total_xp = 0
        self.collected_xp = 0
        self.x_ammo = 0
        self.z_ammo = 0
        self.c_ammo = 0  # Balas acumuladas do poder C
        self.x_charge = 0.0
        self.z_charge = 0.0
        self.c_cooldown = 0.0

        self.build_level(1, fresh=True)

    def set_message(self, text, frames=150):
        self.message = text
        self.message_timer = frames

    def build_level(self, level, fresh=False):
        random.seed(level * 91)
        self.level = level
        self.level_width = 4200 if level == 10 else 2500 + level * 260
        self.platforms = [Platform(0, HEIGHT - 70, self.level_width, 70)]
        self.enemies = []
        self.pickups = []
        self.crate = None
        self.bullets = []
        self.boss = None
        self.boss_room_closed = False

        for i in range(5 + level):
            x = 330 + i * 280 + random.randint(-65, 65)
            y = HEIGHT - 170 - (i % 3) * 78 - random.randint(0, 35)
            self.platforms.append(Platform(x, y, 180, 24))
            if i % 2 == 0:
                self.pickups.append(Pickup(x + 80, y - 26, self.xp_img, "xp"))

        for i in range(max(2, level + 1)):
            x = 520 + i * 360 + random.randint(-90, 90)
            y = HEIGHT - 128
            self.enemies.append(Enemy(x, y, self.enemy_img, self.npc_img, level))

        if level == 1 and not self.player.has_weapon:
            self.crate = Crate(430, HEIGHT - 112)

        if level < 10:
            self.pickups.append(Pickup(self.level_width - 150, HEIGHT - 110, self.objective_img, "exit"))
        else:
            self.platforms.extend([
                Platform(self.level_width - 1110, HEIGHT - 175, 210, 24),
                Platform(self.level_width - 875, HEIGHT - 285, 210, 24),
                Platform(self.level_width - 640, HEIGHT - 405, 210, 24),
                Platform(self.level_width - 430, HEIGHT - 285, 190, 24),
                Platform(self.level_width - 335, HEIGHT - 175, 160, 24),
            ])
            self.boss = Boss(self.boss_img, self.level_width)

        if fresh:
            self.total_xp = sum(1 for lvl in range(1, 11) for i in range(5 + lvl) if i % 2 == 0)
            self.collected_xp = 0

        self.player.reset_for_level(level)
        self.set_message(f"Level {level}", 90)

    def restart_from_level_one(self):
        self.player.lives = PLAYER_LIVES_MAX
        self.player.hp = PLAYER_HP_MAX
        self.player.has_weapon = False
        self.x_ammo = 0
        self.z_ammo = 0
        self.c_ammo = 0
        self.x_charge = 0
        self.z_charge = 0
        self.c_cooldown = 0
        self.collected_xp = 0
        self.game_won = False
        self.build_level(1)
        self.set_message("Sem vidas: voltaste ao level 1", 180)

    def damage_player(self, amount):
        if self.player.invuln:
            return
        self.player.hp -= amount
        self.player.invuln = 80
        if self.player.hp <= 0:
            new_level = self.player.lose_life(self.level)
            if self.player.lives <= 0:
                self.restart_from_level_one()
            else:
                self.build_level(new_level)
                self.set_message("Perdeste uma vida", 120)

    def give_weapon_c(self):
        self.player.has_weapon = True
        self.x_ammo = 999
        self.z_ammo = 999
        self.c_ammo = 999
        self.collected_xp = self.total_xp
        self.c_cooldown = 0

    def goto_boss(self):
        self.build_level(10)

    def add_c_power(self):
        self.c_ammo += 1
        self.collected_xp = self.total_xp
        self.c_cooldown = 0

    def damage_boss_quick(self):
        if self.boss and self.boss.alive():
            damage = int(self.boss.hp * 0.9999)
            self.boss.take_damage(damage)

    def cure_all_enemies(self):
        """Transforma todos os inimigos em NPCs (Steves)"""
        for enemy in self.enemies:
            enemy.cured = True

    def shoot(self, key):
        if not self.player.has_weapon:
            self.set_message("Abre a caixa para usar a arma", 90)
            return

        mouse = pygame.mouse.get_pos()
        sx = WIDTH / self.window_size[0]
        sy = HEIGHT / self.window_size[1]
        camera_x = self.camera_x()
        target = (mouse[0] * sx + camera_x, mouse[1] * sy)
        origin = self.player.rect.center

        if key == pygame.K_x and self.x_ammo >= 1:
            self.x_ammo -= 1
            self.bullets.append(Bullet(origin[0], origin[1], target, 1, 14, CYAN, 5))
        elif key == pygame.K_z and self.z_ammo >= 1:
            self.z_ammo -= 1
            self.bullets.append(Bullet(origin[0], origin[1], target, 5, 11, PURPLE, 8))
        elif key == pygame.K_c:
            if self.collected_xp < self.total_xp:
                self.set_message("O poder C pede todos os XP", 100)
            elif self.c_ammo >= 1:
                self.c_ammo -= 1
                self.bullets.append(Bullet(origin[0], origin[1], target, 20, 9, YELLOW, 12, blast=90))
            elif self.c_cooldown <= 0:
                self.c_cooldown = 30.0
                self.bullets.append(Bullet(origin[0], origin[1], target, 20, 9, YELLOW, 12, blast=90))
            else:
                self.set_message(f"C em cooldown: {int(self.c_cooldown)}s", 60)

    def camera_x(self):
        return clamp(self.player.rect.centerx - WIDTH // 2, 0, max(0, self.level_width - WIDTH))

    def update_ammo(self, dt):
        if not self.player.has_weapon:
            return
        self.x_charge += dt
        self.z_charge += dt
        while self.x_charge >= 1.0:
            self.x_ammo += 1
            self.x_charge -= 1.0
        while self.z_charge >= 15.0:
            self.z_ammo += 1
            self.z_charge -= 15.0
        self.c_cooldown = max(0, self.c_cooldown - dt)

    def handle_pickups(self):
        if self.crate and not self.crate.opened and self.player.rect.colliderect(self.crate.rect):
            self.crate.opened = True
            self.player.has_weapon = True
            self.x_ammo = max(self.x_ammo, 3)
            self.set_message("Arma desbloqueada: X, Z e C", 140)

        for pickup in self.pickups:
            if pickup.taken or not self.player.rect.colliderect(pickup.rect):
                continue
            pickup.taken = True
            if pickup.kind == "xp":
                self.collected_xp += 1
                self.set_message(f"XP {self.collected_xp}/{self.total_xp}", 60)
            elif pickup.kind == "exit":
                self.build_level(self.level + 1)

    def update_bullets(self):
        for bullet in self.bullets[:]:
            bullet.update()
            remove = bullet.life <= 0 or bullet.x < 0 or bullet.x > self.level_width or bullet.y < -80 or bullet.y > HEIGHT + 80

            targets = [enemy for enemy in self.enemies if not enemy.cured]
            if self.boss and self.boss.alive():
                targets.append(self.boss)

            for target in targets:
                if bullet.rect.colliderect(target.rect):
                    target.take_damage(bullet.damage)
                    if bullet.blast:
                        for enemy in self.enemies:
                            if not enemy.cured and math.hypot(enemy.rect.centerx - bullet.x, enemy.rect.centery - bullet.y) < bullet.blast:
                                enemy.take_damage(bullet.damage)
                    remove = True
                    break

            if remove and bullet in self.bullets:
                self.bullets.remove(bullet)

    def update_boss(self):
        if not self.boss:
            return
        boss_gate = self.level_width - 1180
        if self.player.rect.centerx > boss_gate:
            self.boss_room_closed = True
        if self.boss_room_closed and self.player.rect.left < boss_gate:
            self.player.rect.left = boss_gate

        camera_x = self.camera_x()
        self.boss.update(self.player, camera_x)
        if self.boss.laser_hits(self.player):
            self.player.lives -= 1
            if self.player.lives <= 0:
                self.restart_from_level_one()
            else:
                self.build_level(10)
                self.set_message("Laser do boss: voltaste ao inicio do level 10", 150)
        if self.boss and not self.boss.alive() and not self.game_won:
            self.game_won = True
            # VITORIA: cura todos os inimigos e muda o fundo
            self.cure_all_enemies()
            self.set_message("Salvaste a floresta. A floresta voltou a ser dia!", 360)

    def update(self, dt):
        keys = pygame.key.get_pressed()
        if not self.game_won:
            self.player.update(keys, self.platforms, self.level_width)
            self.update_ammo(dt)
            self.handle_pickups()
            for enemy in self.enemies:
                enemy.update(self.platforms)
                if not enemy.cured and enemy.rect.colliderect(self.player.rect):
                    self.damage_player(50)
            self.update_bullets()
            self.update_boss()
            if self.player.rect.top > HEIGHT + 120:
                self.damage_player(PLAYER_HP_MAX)
        self.message_timer = max(0, self.message_timer - 1)

    def draw_background(self, camera_x):
        if self.game_won:
            self.canvas.blit(self.bg_vivo, (0, 0))
            
            # Overlay dourado suave
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((255, 255, 200, 30))
            self.canvas.blit(overlay, (0, 0))
        else:
            # Noite normal
            bg_x = -(int(camera_x * 0.2) % WIDTH)
            self.canvas.blit(self.bg_image, (bg_x, 0))
            self.canvas.blit(self.bg_image, (bg_x + WIDTH, 0))

        # Chao do jogo (ground)
        pygame.draw.rect(self.canvas, GROUND, (0, HEIGHT - 70, WIDTH, 70))
        # Textura do chao
        for i in range(WIDTH // 20 + 1):
            gx = i * 20 - int(camera_x * 0.5) % 20
            pygame.draw.line(self.canvas, (45, 65, 35), (gx, HEIGHT - 70), (gx + 10, HEIGHT - 65), 2)

    def draw_hud(self):
        pygame.draw.rect(self.canvas, (0, 0, 0, 150), (0, 0, WIDTH, 82))
        draw_text(self.canvas, self.font, f"Save the Forest  Level {self.level}/10", 22, 15)
        draw_text(self.canvas, self.small_font, "WASD mover  Mouse mirar  X bala  Z especial  C poder final  ESC sair", 22, 48, (190, 205, 214))

        for i in range(self.player.lives):
            x = WIDTH - 330 + i * 29
            self.canvas.blit(self.life_img, (x, 12))

        hp_w = 220
        pygame.draw.rect(self.canvas, (60, 18, 18), (WIDTH - 330, 46, hp_w, 18), border_radius=4)
        pygame.draw.rect(self.canvas, RED, (WIDTH - 330, 46, int(hp_w * self.player.hp / PLAYER_HP_MAX), 18), border_radius=4)
        draw_text(self.canvas, self.small_font, f"HP {self.player.hp}/{PLAYER_HP_MAX}", WIDTH - 104, 45)

        y = 92
        draw_text(self.canvas, self.small_font, f"XP {self.collected_xp}/{self.total_xp}", 22, y, YELLOW)
        
        # Weapon HUD - only shows when player has weapon
        if self.player.has_weapon:
            weapon_text = f"Arma: sim  X:{self.x_ammo}  Z:{self.z_ammo}  C:{self.c_ammo}"
            draw_text(self.canvas, self.small_font, weapon_text, 22, y + 24, CYAN)
        else:
            draw_text(self.canvas, self.small_font, "Arma: nao (abre a caixa!)", 22, y + 24, (150, 150, 150))

        if self.boss and self.boss.alive():
            bar_x, bar_y, bar_w = WIDTH // 2 - 260, 96, 520
            pygame.draw.rect(self.canvas, (45, 10, 10), (bar_x, bar_y, bar_w, 22), border_radius=5)
            pygame.draw.rect(self.canvas, RED, (bar_x, bar_y, int(bar_w * self.boss.hp / self.boss.max_hp), 22), border_radius=5)
            draw_text(self.canvas, self.small_font, f"BOSS {self.boss.hp}/{self.boss.max_hp}", bar_x + 190, bar_y + 2)

        if self.message_timer and self.message:
            draw_text(self.canvas, self.font, self.message, WIDTH // 2, 145, WHITE, center=True)

        if self.game_won:
            draw_text(self.canvas, self.big_font, "VITORIA", WIDTH // 2, HEIGHT // 2 - 50, WHITE, center=True)
            draw_text(self.canvas, self.font, "A floresta esta salva.", WIDTH // 2, HEIGHT // 2 + 8, WHITE, center=True)

    def draw(self):
        camera_x = self.camera_x()
        self.draw_background(camera_x)
        for platform in self.platforms:
            platform.draw(self.canvas, camera_x)
        if self.crate:
            self.crate.draw(self.canvas, camera_x)
        for pickup in self.pickups:
            pickup.draw(self.canvas, camera_x)
        for enemy in self.enemies:
            enemy.draw(self.canvas, camera_x)
        if self.boss:
            self.boss.draw(self.canvas, camera_x)
        for bullet in self.bullets:
            bullet.draw(self.canvas, camera_x)
        self.player.draw(self.canvas, camera_x)

        if self.boss_room_closed:
            gate_x = self.level_width - 1180 - camera_x
            pygame.draw.rect(self.canvas, (80, 20, 20), (gate_x, 80, 18, HEIGHT - 150))

        self.draw_hud()

        scaled = pygame.transform.smoothscale(self.canvas, self.window_size)
        self.screen.blit(scaled, (0, 0))
        pygame.display.flip()

    def toggle_fullscreen(self):
        self.fullscreen = not self.fullscreen
        flags = pygame.FULLSCREEN if self.fullscreen else 0
        size = (0, 0) if self.fullscreen else (WIDTH, HEIGHT)
        self.screen = pygame.display.set_mode(size, flags)
        self.window_size = self.screen.get_size()

    def run(self):
        while True:
            dt = self.clock.tick(FPS) / 1000.0
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        pygame.quit()
                        sys.exit()
                    if event.key == pygame.K_F11:
                        self.toggle_fullscreen()
                    if event.key in (pygame.K_x, pygame.K_z, pygame.K_c):
                        self.shoot(event.key)
                    if event.unicode == "«":
                        self.player.gain_life()
                    if event.key == pygame.K_MINUS:  # Tecla - (hifen/menos)
                        self.give_weapon_c()
                    if event.key == pygame.K_COMMA:  # Tecla , (virgula) -> teleporta boss
                        self.goto_boss()
                    if event.key == pygame.K_PERIOD:  # Tecla . (ponto) -> +1 poder C + todos XP
                        self.add_c_power()
                    if event.key == pygame.K_RCTRL:  # Ctrl Direito -> 99.99% dano boss
                        self.damage_boss_quick()

            self.update(dt)
            self.draw()


if __name__ == "__main__":
    Game().run()
