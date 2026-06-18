import math
import os
import random
from fractions import Fraction
import tkinter as tk


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.join(BASE_DIR, "Artes")

FPS_MS = 16
PLAYER_SPEED = 5
PROJECTILE_SPEED = 11
GRAVITY = 0.8
JUMP_VELOCITY = 14
CAMERA_ZOOM = 1.40
CAMERA_BATTLE_ZOOM = 1.82


def clamp(value, low, high):
    return max(low, min(high, value))


def rects_intersect(a, b):
    return not (
        a["x"] + a["w"] < b["x"]
        or a["x"] > b["x"] + b["w"]
        or a["y"] + a["h"] < b["y"]
        or a["y"] > b["y"] + b["h"]
    )


class SpriteBank:
    def __init__(self):
        self.cache = {}
        self.scaled_cache = {}

    def load(self, filename, scale=1.0):
        path = os.path.join(ART_DIR, filename)
        if not os.path.exists(path):
            return None
        if scale == 1.0:
            if path not in self.cache:
                try:
                    self.cache[path] = tk.PhotoImage(file=path)
                except tk.TclError:
                    self.cache[path] = None
            return self.cache[path]

        scaled_key = (path, scale)
        if scaled_key not in self.scaled_cache:
            base = self.load(filename)
            if base is None:
                self.scaled_cache[scaled_key] = None
            else:
                ratio = Fraction(scale).limit_denominator(8)
                scaled = base.zoom(ratio.numerator, ratio.numerator)
                if ratio.denominator != 1:
                    scaled = scaled.subsample(ratio.denominator, ratio.denominator)
                self.scaled_cache[scaled_key] = scaled
        return self.scaled_cache[scaled_key]


class Entity:
    def __init__(self, x, y, w, h, hp=1):
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.hp = hp
        self.max_hp = hp
        self.alive = True

    @property
    def rect(self):
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}


class Platform(Entity):
    def __init__(self, x, y, w, h):
        super().__init__(x, y, w, h)


class BloodParticle(Entity):
    def __init__(self, x, y, vx, vy, color, life):
        super().__init__(x, y, 4, 4)
        self.vx = vx
        self.vy = vy
        self.color = color
        self.life = life
        self.gravity = 0.35


class Player(Entity):
    def __init__(self, x, y):
        super().__init__(x, y, 28, 28, hp=6)
        self.vx = 0
        self.vy = 0
        self.invulnerable = 0
        self.attack_cooldown = 0
        self.special_cooldown = 0
        self.facing_dir = 1
        self.on_ground = False


class Enemy(Entity):
    def __init__(self, x, y, kind, hp=3):
        super().__init__(x, y, 34, 34, hp=hp)
        self.kind = kind
        self.timer = 0
        self.phase = 0
        self.anchor_x = x
        self.anchor_y = y


class Projectile(Entity):
    def __init__(self, x, y, vx, vy, owner, color, damage=1, radius=6):
        super().__init__(x - radius, y - radius, radius * 2, radius * 2)
        self.vx = vx
        self.vy = vy
        self.owner = owner
        self.color = color
        self.damage = damage


class Pickup(Entity):
    def __init__(self, x, y, kind):
        super().__init__(x, y, 20, 20)
        self.kind = kind


class Game:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("A Lenda dos Olhos")
        self.root.configure(bg="black")
        self.root.attributes("-fullscreen", True)

        self.fullscreen = True
        self.running = True
        self.state = "title"
        self.camera_zoom = CAMERA_ZOOM

        self.width = self.root.winfo_screenwidth()
        self.height = self.root.winfo_screenheight()

        self.canvas = tk.Canvas(self.root, highlightthickness=0, bg="#050407")
        self.canvas.pack(fill="both", expand=True)

        self.sprites = SpriteBank()
        self.load_sprites()

        self.keys = set()
        self.message = ""
        self.message_timer = 0
        self.ui_buttons = []
        self.awaiting_binding = None
        self.control_bindings = {
            "left": "a",
            "right": "d",
            "jump": "w",
            "attack": "x",
            "special": "lshift",
        }

        self.levels = [
            ("Guardiao do Eco", "dash"),
            ("Bruxa do Circulo", "orbit"),
            ("Cacador do Veu", "homing"),
            ("Espirito da Nevoa", "teleport"),
            ("Arauto do Sangue", "split"),
            ("Boss Final", "boss"),
        ]
        self.level_index = 0
        self.world_width = 2800
        self.ground_y = int(self.height * 0.82)
        self.world_height = self.ground_y + 320
        self.camera_x = 0
        self.camera_y = 0
        self.camera_shake_x = 0
        self.camera_shake_y = 0
        self.camera_zoom = CAMERA_ZOOM
        self.goal_spawned = False
        self.collectibles_total = 5
        self.collectibles_collected = 0
        self.door_open = False
        self.keys_total = 5
        self.keys_collected = 0
        self.boss_spawned = False
        self.max_unlocked_level = 0

        self.player = Player(160, self.ground_y - 28)
        self.platforms = []
        self.enemies = []
        self.projectiles = []
        self.pickups = []
        self.blood_particles = []
        self.objective = None
        self.boss = None
        self.current_level = None
        self.score = 0
        self.shake = 0

        self.bind_events()
        self.start_title()
        self.loop()

    def load_sprites(self):
        self.img_background = self.sprites.load("fundo.png")
        self.img_title = self.sprites.load("capa.png")
        self.img_player = self.sprites.load("jogador.png")
        self.img_player_zoom = self.sprites.load("jogador.png", self.camera_zoom)
        self.img_enemy = self.sprites.load("inimigo.png")
        self.img_enemy_zoom = self.sprites.load("inimigo.png", self.camera_zoom)
        self.img_boss = self.sprites.load("boss.png")
        self.img_boss_zoom = self.sprites.load("boss.png", self.camera_zoom)
        self.img_objective = self.sprites.load("objetivo.png")
        self.img_objective_zoom = self.sprites.load("objetivo.png", self.camera_zoom)
        self.img_heal = self.sprites.load("cura.png")
        self.img_heal_zoom = self.sprites.load("cura.png", self.camera_zoom)
        self.img_collect = self.sprites.load("coletavel.png")
        self.img_collect_zoom = self.sprites.load("coletavel.png", self.camera_zoom)
        self.img_special = self.sprites.load("especial.png")
        self.img_special_zoom = self.sprites.load("especial.png", self.camera_zoom)

    def bind_events(self):
        self.root.bind("<KeyPress>", self.on_key_press)
        self.root.bind("<KeyRelease>", self.on_key_release)
        self.canvas.bind("<Button-1>", self.on_mouse_click)
        self.root.protocol("WM_DELETE_WINDOW", self.close)

    def close(self):
        self.running = False
        self.root.destroy()

    def on_key_press(self, event):
        key = event.keysym.lower()
        self.keys.add(key)

        if self.awaiting_binding:
            if key == "escape":
                self.awaiting_binding = None
                return
            self.control_bindings[self.awaiting_binding] = key
            self.awaiting_binding = None
            return

        if key == "f11":
            self.toggle_fullscreen()
            return

        if key == "escape":
            if self.state == "title":
                self.close()
            elif self.state in {"level_select", "commands"}:
                self.start_title()
            else:
                self.state = "paused" if self.state != "paused" else "playing"
            return

        if self.state == "title" and key in {"return", "space"}:
            self.start_level_select()
            return

        if self.state == "level_select" and key in {"return", "space"}:
            self.level_index = 0
            self.start_game()
            return

        if self.state == "commands" and key == "return":
            self.start_title()
            return

        if self.state in {"gameover", "victory"} and key in {"return", "r"}:
            self.start_title()
            return

        if self.state != "playing":
            return

        if key in {self.control_bindings["jump"], "up", "space"} and self.player.on_ground:
            self.player.vy = -JUMP_VELOCITY
            self.player.on_ground = False

    def on_key_release(self, event):
        self.keys.discard(event.keysym.lower())

    def on_mouse_click(self, event):
        for button in self.ui_buttons:
            if button["x1"] <= event.x <= button["x2"] and button["y1"] <= event.y <= button["y2"]:
                if button.get("locked"):
                    self.message = "Nivel bloqueado"
                    self.message_timer = 90
                    return
                action = button["action"]
                if action == "play":
                    self.start_level_select()
                elif action == "commands":
                    self.state = "commands"
                    self.awaiting_binding = None
                elif action == "back_title":
                    self.start_title()
                elif action == "back_select":
                    self.start_level_select()
                elif action == "start_level":
                    self.level_index = button["level_index"]
                    self.start_game()
                elif action.startswith("bind_"):
                    self.awaiting_binding = action.replace("bind_", "", 1)
                return

    def toggle_fullscreen(self):
        self.fullscreen = not self.fullscreen
        self.root.attributes("-fullscreen", self.fullscreen)
        if not self.fullscreen:
            self.root.geometry("1280x720")

    def start_title(self):
        self.state = "title"
        self.message = ""
        self.message_timer = 0
        self.level_index = 0
        self.camera_x = 0
        self.camera_y = 0
        self.camera_shake_x = 0
        self.camera_shake_y = 0
        self.goal_spawned = False
        self.collectibles_total = 5
        self.collectibles_collected = 0
        self.door_open = False
        self.platforms = []
        self.enemies = []
        self.projectiles = []
        self.pickups = []
        self.blood_particles = []
        self.objective = None
        self.boss = None
        self.current_level = None
        self.score = 0
        self.player = Player(160, self.ground_y - 28)
        self.awaiting_binding = None

    def start_level_select(self):
        self.state = "level_select"
        self.message = ""
        self.message_timer = 0
        self.awaiting_binding = None

    def start_game(self):
        self.state = "playing"
        self.score = 0
        self.shake = 0
        self.camera_zoom = CAMERA_ZOOM
        self.player = Player(160, self.ground_y - 28)
        self.spawn_level(self.level_index)

    def spawn_level(self, index):
        self.current_level = self.levels[index]
        self.world_width = 2800
        self.ground_y = int(self.height * 0.82)
        self.world_height = self.ground_y + 320
        self.camera_x = 0
        self.camera_y = 0
        self.camera_shake_x = 0
        self.camera_shake_y = 0
        self.camera_zoom = CAMERA_ZOOM
        self.goal_spawned = False
        self.collectibles_total = 5
        self.collectibles_collected = 0
        self.door_open = False
        self.boss_spawned = False
        self.objective = None
        self.boss = None
        self.projectiles = []
        self.pickups = []
        self.blood_particles = []
        self.platforms = self.build_platform_level(index)
        self.enemies = []

        enemy_x = self.world_width - 360
        enemy_y = self.ground_y - 34
        enemy_kind = self.current_level[1]
        if enemy_kind == "boss":
            self.spawn_exit()
        else:
            if enemy_kind == "orbit":
                enemy_y -= 90
            elif enemy_kind == "homing":
                enemy_y -= 40
            elif enemy_kind == "teleport":
                enemy_y -= 120
            elif enemy_kind == "split":
                enemy_y -= 30
            self.enemies.append(Enemy(enemy_x, enemy_y, enemy_kind, hp=3 + index))

        self.pickups.extend(
            [
                Pickup(280, self.ground_y - 110, "collect"),
                Pickup(620, self.ground_y - 180, "collect"),
                Pickup(1040, self.ground_y - 140, "collect"),
                Pickup(1560, self.ground_y - 190, "collect"),
                Pickup(self.world_width - 620, self.ground_y - 150, "collect"),
                Pickup(920, self.ground_y - 90, "heal"),
                Pickup(1400, self.ground_y - 120, "special"),
            ]
        )
        if index != len(self.levels) - 1:
            self.spawn_exit()

    def build_platform_level(self, index):
        p = []
        ground_h = 40
        p.extend(
            [
                Platform(0, self.ground_y, 500, ground_h),
                Platform(640, self.ground_y, 440, ground_h),
                Platform(1180, self.ground_y, 420, ground_h),
                Platform(1760, self.ground_y, 1040, ground_h),
            ]
        )

        if index == 0:
            p.extend(
                [
                    Platform(180, self.ground_y - 90, 220, 20),
                    Platform(760, self.ground_y - 130, 180, 20),
                    Platform(1320, self.ground_y - 100, 200, 20),
                    Platform(1960, self.ground_y - 150, 180, 20),
                ]
            )
        elif index == 1:
            p.extend(
                [
                    Platform(160, self.ground_y - 60, 160, 20),
                    Platform(420, self.ground_y - 150, 170, 20),
                    Platform(860, self.ground_y - 210, 190, 20),
                    Platform(1500, self.ground_y - 120, 210, 20),
                    Platform(2060, self.ground_y - 180, 160, 20),
                ]
            )
        elif index == 2:
            p.extend(
                [
                    Platform(240, self.ground_y - 100, 150, 20),
                    Platform(560, self.ground_y - 180, 200, 20),
                    Platform(940, self.ground_y - 240, 170, 20),
                    Platform(1320, self.ground_y - 150, 180, 20),
                    Platform(2140, self.ground_y - 220, 180, 20),
                ]
            )
        elif index == 3:
            p.extend(
                [
                    Platform(240, self.ground_y - 80, 170, 20),
                    Platform(500, self.ground_y - 170, 160, 20),
                    Platform(840, self.ground_y - 110, 180, 20),
                    Platform(1180, self.ground_y - 220, 220, 20),
                    Platform(1620, self.ground_y - 140, 200, 20),
                    Platform(2140, self.ground_y - 170, 170, 20),
                ]
            )
        elif index == 4:
            p.extend(
                [
                    Platform(180, self.ground_y - 120, 160, 20),
                    Platform(460, self.ground_y - 200, 170, 20),
                    Platform(820, self.ground_y - 260, 200, 20),
                    Platform(1200, self.ground_y - 200, 160, 20),
                    Platform(1560, self.ground_y - 120, 200, 20),
                    Platform(2040, self.ground_y - 240, 210, 20),
                ]
            )
        return p

    def spawn_exit(self):
        if self.goal_spawned:
            return
        self.goal_spawned = True
        self.objective = Pickup(self.world_width - 120, self.ground_y - 34, "objective")
        self.objective.w = 34
        self.objective.h = 34
        self.door_open = False

    def spawn_boss(self):
        boss = Enemy(self.world_width - 360, self.ground_y - 130, "boss", hp=24)
        boss.w = 92
        boss.h = 92
        self.boss = boss
        self.enemies = [boss]
        self.message = "O boss apareceu"
        self.message_timer = 150
        self.shake = max(self.shake, 6)

    def spawn_key_drop(self, enemy):
        self.pickups.append(Pickup(enemy.x + enemy.w / 2, enemy.y, "key"))

    def spawn_blood_explosion(self, enemy):
        colors = ["#6f0000", "#9f0000", "#c00018", "#7d0d0d"]
        for _ in range(28):
            angle = random.uniform(0, math.tau)
            speed = random.uniform(2.5, 8.5)
            self.blood_particles.append(
                BloodParticle(
                    enemy.x + enemy.w / 2,
                    enemy.y + enemy.h / 2,
                    math.cos(angle) * speed,
                    math.sin(angle) * speed - random.uniform(0, 2),
                    random.choice(colors),
                    random.randint(25, 70),
                )
            )

    def update(self):
        if self.state != "playing":
            return

        self.handle_player_movement()
        self.handle_player_attacks()
        self.update_enemies()
        self.update_projectiles()
        self.update_blood_particles()
        self.update_pickups()
        self.update_objective()
        self.update_timers()
        self.resolve_collisions()
        self.update_camera()

    def update_camera(self):
        boss_active = self.boss is not None and self.boss.alive
        target_zoom = CAMERA_BATTLE_ZOOM if boss_active else CAMERA_ZOOM
        self.camera_zoom += (target_zoom - self.camera_zoom) * 0.08

        viewport_width = self.width / self.camera_zoom
        viewport_height = self.height / self.camera_zoom

        if boss_active:
            focus_x = (self.player.x + self.player.w / 2 + self.boss.x + self.boss.w / 2) / 2
            focus_y = (self.player.y + self.player.h / 2 + self.boss.y + self.boss.h / 2) / 2 - 20
            target_x = focus_x - viewport_width * 0.5
            target_y = focus_y - viewport_height * 0.5
        else:
            look_ahead_x = clamp(self.player.vx * 8 + self.player.facing_dir * 30, -75, 75)
            look_ahead_y = clamp(self.player.vy * 2.8, -48, 60)
            target_x = self.player.x + self.player.w / 2 + look_ahead_x - viewport_width * 0.44
            target_y = self.player.y + self.player.h / 2 + look_ahead_y - viewport_height * 0.54

        target_x = clamp(target_x, 0, max(0, self.world_width - viewport_width))
        target_y = clamp(target_y, 0, max(0, self.world_height - viewport_height))

        lerp_x = 0.11 if self.player.on_ground else 0.07
        lerp_y = 0.10 if self.player.on_ground else 0.08
        self.camera_x += (target_x - self.camera_x) * lerp_x
        self.camera_y += (target_y - self.camera_y) * lerp_y

        if self.shake > 0:
            strength = self.shake * 0.6
            self.camera_shake_x = random.uniform(-strength, strength)
            self.camera_shake_y = random.uniform(-strength, strength)
        else:
            self.camera_shake_x = 0
            self.camera_shake_y = 0

    def handle_player_movement(self):
        dx = 0
        left_key = self.control_bindings["left"]
        right_key = self.control_bindings["right"]
        if left_key in self.keys or "left" in self.keys:
            dx -= PLAYER_SPEED
        if right_key in self.keys or "right" in self.keys:
            dx += PLAYER_SPEED
        if dx != 0:
            self.player.facing_dir = 1 if dx > 0 else -1

        self.player.vx = dx
        self.player.x += dx
        self.player.vy += GRAVITY
        self.player.y += self.player.vy
        self.player.x = clamp(self.player.x, 0, self.world_width - self.player.w)
        self.resolve_platform_collisions()

        if self.player.attack_cooldown > 0:
            self.player.attack_cooldown -= 1
        if self.player.special_cooldown > 0:
            self.player.special_cooldown -= 1

    def handle_player_attacks(self):
        attack_key = self.control_bindings["attack"]
        special_key = self.control_bindings["special"]
        if attack_key in self.keys and self.player.attack_cooldown == 0:
            fx = self.player.facing_dir
            self.projectiles.append(
                Projectile(
                    self.player.x + self.player.w / 2 + fx * 16,
                    self.player.y + self.player.h / 2,
                    fx * PROJECTILE_SPEED,
                    0,
                    "player",
                    "#d8c38c",
                    damage=1,
                    radius=6,
                )
            )
            self.player.attack_cooldown = 12

        if special_key in self.keys and self.player.special_cooldown == 0:
            fx = self.player.facing_dir
            for angle in (-0.20, 0.0, 0.20):
                vx = fx * math.cos(angle) * PROJECTILE_SPEED * 1.25
                vy = math.sin(angle) * PROJECTILE_SPEED * 1.25
                self.projectiles.append(
                    Projectile(
                        self.player.x + self.player.w / 2,
                        self.player.y + self.player.h / 2,
                        vx,
                        vy,
                        "player",
                        "#ff8f6b",
                        damage=2,
                        radius=7,
                    )
                )
            self.player.special_cooldown = 90

    def update_enemies(self):
        for enemy in self.enemies:
            if not enemy.alive:
                continue
            enemy.timer += 1
            if self.boss is not None and enemy is self.boss:
                self.boss_pattern(enemy)
                continue
            if enemy.kind == "dash":
                self.enemy_dash(enemy)
            elif enemy.kind == "orbit":
                self.enemy_orbit(enemy)
            elif enemy.kind == "homing":
                self.enemy_homing(enemy)
            elif enemy.kind == "teleport":
                self.enemy_teleport(enemy)
            elif enemy.kind == "split":
                self.enemy_split(enemy)

    def enemy_dash(self, enemy):
        if enemy.timer % 70 == 1:
            enemy.phase = 18
            enemy.anchor_x = enemy.x
        if enemy.phase > 0:
            direction = 1 if self.player.x > enemy.x else -1
            enemy.x += direction * 7
            enemy.phase -= 1

    def enemy_orbit(self, enemy):
        enemy.anchor_x = enemy.anchor_x if enemy.anchor_x else enemy.x
        enemy.anchor_y = enemy.anchor_y if enemy.anchor_y else enemy.y
        enemy.x = enemy.anchor_x + math.cos(enemy.timer * 0.05) * 120
        enemy.y = enemy.anchor_y + math.sin(enemy.timer * 0.05) * 60
        if enemy.timer % 80 == 0:
            self.fire_at_player(enemy, 1.0, 1, "#cf6")

    def enemy_homing(self, enemy):
        if enemy.timer % 2 == 0:
            direction = 1 if self.player.x > enemy.x else -1
            enemy.x += direction * 3.2
        if enemy.timer % 70 == 0:
            self.fire_at_player(enemy, 1.4, 1, "#7bffcf")

    def enemy_teleport(self, enemy):
        if enemy.timer % 75 == 0:
            enemy.x = random.uniform(self.width * 0.4, self.world_width - 240)
            enemy.y = random.uniform(self.ground_y - 280, self.ground_y - 120)
            self.fire_spread(enemy, 6, 1.0, 1, "#ffcc66")
        if enemy.timer % 16 == 0:
            self.shake = max(self.shake, 2)

    def enemy_split(self, enemy):
        if enemy.timer % 50 == 0:
            self.fire_spread(enemy, 8, 1.0, 1, "#ff4b70")
        if enemy.timer % 90 == 0:
            enemy.phase = 1 - enemy.phase
        enemy.x += (1.2 if enemy.phase else -1.2) + math.sin(enemy.timer * 0.05) * 1.2
        enemy.y += math.cos(enemy.timer * 0.03) * 1.2

    def boss_pattern(self, boss):
        if boss.timer % 18 == 0:
            self.fire_at_player(boss, 1.8, 1, "#ffffff")
        if boss.timer % 46 == 0:
            self.fire_spread(boss, 10, 1.2, 1, "#e06cff")
        if boss.timer % 110 == 0:
            boss.x = random.uniform(self.width * 0.5, self.world_width - 260)
            boss.y = random.uniform(self.ground_y - 280, self.ground_y - 120)
            self.shake = max(self.shake, 6)

    def fire_at_player(self, enemy, speed_factor=1.0, damage=1, color="#cf6"):
        dx = self.player.x - enemy.x
        dy = self.player.y - enemy.y
        angle = math.atan2(dy, dx)
        self.projectiles.append(
            Projectile(
                enemy.x + enemy.w / 2,
                enemy.y + enemy.h / 2,
                math.cos(angle) * PROJECTILE_SPEED * speed_factor,
                math.sin(angle) * PROJECTILE_SPEED * speed_factor,
                "enemy",
                color,
                damage=damage,
                radius=6,
            )
        )

    def fire_spread(self, enemy, count=5, speed_factor=1.0, damage=1, color="#ffcc66"):
        base_angle = math.atan2(self.player.y - enemy.y, self.player.x - enemy.x)
        spread = 0.38
        angles = [base_angle] if count == 1 else [base_angle + spread * (i - (count - 1) / 2) for i in range(count)]
        for angle in angles:
            self.projectiles.append(
                Projectile(
                    enemy.x + enemy.w / 2,
                    enemy.y + enemy.h / 2,
                    math.cos(angle) * PROJECTILE_SPEED * speed_factor,
                    math.sin(angle) * PROJECTILE_SPEED * speed_factor,
                    "enemy",
                    color,
                    damage=damage,
                    radius=5,
                )
            )

    def update_projectiles(self):
        for projectile in self.projectiles:
            projectile.x += projectile.vx
            projectile.y += projectile.vy
            if (
                projectile.x < -40
                or projectile.x > self.world_width + 80
                or projectile.y < -80
                or projectile.y > self.height + 120
            ):
                projectile.alive = False
        self.projectiles = [p for p in self.projectiles if p.alive]

    def update_blood_particles(self):
        for particle in self.blood_particles:
            particle.life -= 1
            particle.vy += particle.gravity
            particle.x += particle.vx
            particle.y += particle.vy
            particle.vx *= 0.98
            particle.vy *= 0.98
            if particle.life <= 0 or particle.y > self.height + 120:
                particle.alive = False
        self.blood_particles = [p for p in self.blood_particles if p.alive]

    def update_pickups(self):
        for pickup in self.pickups:
            if pickup.alive and rects_intersect(self.player.rect, pickup.rect):
                pickup.alive = False
                if pickup.kind == "heal":
                    self.player.hp = min(self.player.max_hp, self.player.hp + 1)
                    self.message = "Encontraste cura"
                    self.message_timer = 120
                elif pickup.kind == "special":
                    self.score += 50
                    self.message = "Poder especial absorvido"
                    self.message_timer = 120
                elif pickup.kind == "collect":
                    self.score += 25
                    self.collectibles_collected += 1
                    if self.collectibles_collected < self.collectibles_total:
                        self.message = "Coletavel {}/{}".format(self.collectibles_collected, self.collectibles_total)
                        self.message_timer = 90
                    else:
                        self.door_open = True
                        self.message = "A porta abriu"
                        self.message_timer = 120
                elif pickup.kind == "key":
                    self.keys_collected += 1
                    self.message = "Chave {}/{}".format(self.keys_collected, self.keys_total)
                    self.message_timer = 120
                    if self.keys_collected >= self.keys_total:
                        self.door_open = True
        self.pickups = [p for p in self.pickups if p.alive]

    def update_objective(self):
        if self.objective and self.objective.alive and rects_intersect(self.player.rect, self.objective.rect):
            if self.level_index >= len(self.levels) - 1:
                if any(enemy.alive and enemy.kind != "boss" for enemy in self.enemies):
                    self.message = "Derrota todos os inimigos primeiro"
                    self.message_timer = 90
                    return
                if self.keys_collected < self.keys_total:
                    self.message = "Precisas das 5 chaves"
                    self.message_timer = 90
                    return
                if not self.boss_spawned:
                    self.boss_spawned = True
                    self.door_open = True
                    self.spawn_boss()
                    return
                if self.boss and self.boss.alive:
                    return
                self.state = "victory"
                self.message = "Voltaste ao mundo normal"
                self.message_timer = 999
            else:
                if any(enemy.alive for enemy in self.enemies):
                    self.message = "Derrota o inimigo antes de sair"
                    self.message_timer = 90
                    return
                if not self.door_open:
                    self.message = "Precisas dos 5 coletaveis"
                    self.message_timer = 90
                    return
                self.level_index += 1
                self.max_unlocked_level = max(self.max_unlocked_level, self.level_index)
                self.spawn_level(self.level_index)

    def update_timers(self):
        if self.player.invulnerable > 0:
            self.player.invulnerable -= 1
        if self.message_timer > 0:
            self.message_timer -= 1
        if self.shake > 0:
            self.shake -= 1

    def resolve_platform_collisions(self):
        self.player.on_ground = False
        before_y = self.player.y - self.player.vy
        for platform in self.platforms:
            if not rects_intersect(self.player.rect, platform.rect):
                continue
            if self.player.vy >= 0 and before_y + self.player.h <= platform.y + 10:
                self.player.y = platform.y - self.player.h
                self.player.vy = 0
                self.player.on_ground = True
            elif self.player.vy < 0 and before_y >= platform.y + platform.h - 10:
                self.player.y = platform.y + platform.h
                self.player.vy = 0

        if self.player.y > self.height + 200:
            self.state = "gameover"

    def resolve_collisions(self):
        for projectile in self.projectiles:
            if projectile.owner == "player":
                targets = [e for e in self.enemies if e.alive]
                if self.boss and self.boss.alive:
                    targets.append(self.boss)
                for enemy in targets:
                    if rects_intersect(projectile.rect, enemy.rect):
                        enemy.hp -= projectile.damage
                        projectile.alive = False
                        if enemy.hp <= 0 and enemy.alive:
                            enemy.alive = False
                            self.score += 100
                            self.message = "Inimigo derrotado"
                            self.message_timer = 90
                            self.spawn_blood_explosion(enemy)
                            if enemy.kind != "boss":
                                self.spawn_key_drop(enemy)
                            self.spawn_exit()
                        break
            else:
                if rects_intersect(projectile.rect, self.player.rect) and self.player.invulnerable == 0:
                    self.player.hp -= projectile.damage
                    self.player.invulnerable = 60
                    projectile.alive = False
                    self.shake = max(self.shake, 4)
                    if self.player.hp <= 0:
                        self.state = "gameover"

        self.projectiles = [p for p in self.projectiles if p.alive]

        for enemy in self.enemies:
            if enemy.alive and rects_intersect(self.player.rect, enemy.rect) and self.player.invulnerable == 0:
                self.player.hp -= 1
                self.player.invulnerable = 45
                self.shake = max(self.shake, 3)
                if self.player.hp <= 0:
                    self.state = "gameover"

        if self.boss and self.boss.alive and rects_intersect(self.player.rect, self.boss.rect) and self.player.invulnerable == 0:
            self.player.hp -= 1
            self.player.invulnerable = 45
            self.shake = max(self.shake, 3)
            if self.player.hp <= 0:
                self.state = "gameover"

    def draw(self):
        self.canvas.delete("all")
        self.ui_buttons = []
        if self.state == "title":
            self.draw_title()
        elif self.state == "level_select":
            self.draw_level_select()
        elif self.state == "commands":
            self.draw_commands()
        else:
            self.draw_gameplay()
            if self.state == "paused":
                self.draw_overlay("PAUSADO", "Pressiona Esc para voltar")
            elif self.state == "gameover":
                self.draw_overlay("GAME OVER", "Enter ou R para recomeçar")
            elif self.state == "victory":
                self.draw_overlay("VITORIA", "Enter ou R para voltar ao inicio")
        self.canvas.update_idletasks()
        self.canvas.update()

    def draw_title(self):
        self.canvas.create_rectangle(0, 0, self.width, self.height, fill="#050407", outline="")
        if self.img_title:
            self.canvas.create_image(self.width / 2, self.height / 2, anchor="center", image=self.img_title)
        self.draw_button(self.width * 0.18, self.height * 0.82, 220, 60, "JOGAR", "play")
        self.draw_button(self.width * 0.42, self.height * 0.82, 260, 60, "COMANDOS", "commands")
        self.canvas.create_text(
            self.width * 0.5,
            self.height * 0.93,
            text="F11 fullscreen | Esc sair | Enter jogar",
            fill="#e8d7cf",
            font=("Consolas", 14),
        )

    def draw_level_select(self):
        self.canvas.create_rectangle(0, 0, self.width, self.height, fill="#050407", outline="")
        self.canvas.create_text(self.width * 0.5, 70, text="Selecao de Niveis", fill="#f0dfcf", font=("Georgia", 30, "bold"))
        level_w = 220
        level_h = 90
        start_x = self.width * 0.10
        start_y = 160
        gap_x = 40
        gap_y = 30
        cols = 3
        for i, level in enumerate(self.levels):
            row = i // cols
            col = i % cols
            x = start_x + col * (level_w + gap_x)
            y = start_y + row * (level_h + gap_y)
            label = "{}".format(i + 1)
            if i == len(self.levels) - 1:
                label = "5 CADEADOS"
            text = "{}\n{}".format(label, level[0])
            locked = i > self.max_unlocked_level
            fill = "#2b1d24" if not locked else "#171117"
            outline = "#7f5663" if not locked else "#4c3a44"
            if locked:
                text = "{}\nBLOQUEADO".format(label)
            self.draw_button(
                x,
                y,
                level_w,
                level_h,
                text,
                "start_level",
                fill=fill,
                outline=outline,
                level_index=i,
                locked=locked,
            )
        self.draw_button(self.width * 0.36, self.height * 0.86, 260, 56, "VOLTAR", "back_title")
        self.canvas.create_text(
            self.width * 0.5,
            self.height * 0.78,
            text="Escolhe um nivel e entra no submundo",
            fill="#cdb8b8",
            font=("Consolas", 14),
        )
        if self.message and self.message_timer > 0:
            self.canvas.create_text(
                self.width * 0.5,
                self.height * 0.90,
                text=self.message,
                fill="#f7d8b7",
                font=("Consolas", 14, "bold"),
            )

    def draw_commands(self):
        self.canvas.create_rectangle(0, 0, self.width, self.height, fill="#050407", outline="")
        self.canvas.create_text(self.width * 0.5, 60, text="Comandos", fill="#f0dfcf", font=("Georgia", 30, "bold"))
        actions = [
            ("left", "Mover esquerda"),
            ("right", "Mover direita"),
            ("jump", "Saltar"),
            ("attack", "Atacar"),
            ("special", "Especial"),
        ]
        y = 150
        for action, label in actions:
            current = self.control_bindings[action].upper()
            if self.awaiting_binding == action:
                current = "PRESSIONA UMA TECLA"
            text = "{}: {}".format(label, current)
            self.draw_button(self.width * 0.20, y, self.width * 0.60, 52, text, "bind_{}".format(action), fill="#24161c")
            y += 70
        self.draw_button(self.width * 0.36, self.height * 0.84, 260, 56, "VOLTAR", "back_title")
        self.canvas.create_text(
            self.width * 0.5,
            self.height * 0.74,
            text="Clica num comando e depois pressiona a nova tecla",
            fill="#cdb8b8",
            font=("Consolas", 14),
        )

    def draw_gameplay(self):
        self.draw_background()

        ox = 0
        oy = 0
        self.draw_platforms(ox, oy)
        self.draw_pickups(ox, oy)
        self.draw_objective(ox, oy)
        self.draw_enemies(ox, oy)
        self.draw_blood_particles(ox, oy)
        self.draw_projectiles(ox, oy)
        self.draw_player(ox, oy)
        self.draw_hud()

        if self.message and self.message_timer > 0:
            self.canvas.create_text(
                self.width / 2,
                self.height * 0.11,
                text=self.message,
                fill="#f7d8b7",
                font=("Consolas", 16, "bold"),
            )

    def draw_background(self):
        if self.img_background:
            tile_w = max(1, self.img_background.width())
            tile_h = max(1, self.img_background.height())
            start_x = -((self.camera_x * 0.35) % tile_w) - tile_w
            start_y = -((self.camera_y * 0.18) % tile_h) - tile_h
            for x in range(int(start_x), self.width + tile_w, tile_w):
                for y in range(int(start_y), self.height + tile_h, tile_h):
                    self.canvas.create_image(x, y, anchor="nw", image=self.img_background)
        else:
            self.canvas.create_rectangle(0, 0, self.width, self.height, fill="#09070b", outline="")

    def world_to_screen(self, x, y):
        return (
            (x - self.camera_x + self.camera_shake_x) * self.camera_zoom,
            (y - self.camera_y + self.camera_shake_y) * self.camera_zoom,
        )

    def world_rect_to_screen(self, x, y, w, h):
        sx, sy = self.world_to_screen(x, y)
        return sx, sy, w * self.camera_zoom, h * self.camera_zoom

    def draw_platforms(self, ox, oy):
        for platform in self.platforms:
            x = platform.x + ox
            y = platform.y + oy
            sx, sy, sw, sh = self.world_rect_to_screen(x, y, platform.w, platform.h)
            if sx + sw < -40 or sx > self.width + 40:
                continue
            self.canvas.create_rectangle(sx, sy, sx + sw, sy + sh, fill="#1a1016", outline="#4e2d34", width=max(1, int(2 * self.camera_zoom)))
            self.canvas.create_line(sx, sy + 6 * self.camera_zoom, sx + sw, sy + 6 * self.camera_zoom, fill="#6d3b43")

    def draw_player(self, ox, oy):
        x = self.player.x + ox
        y = self.player.y + oy
        sx, sy, sw, sh = self.world_rect_to_screen(x, y, self.player.w, self.player.h)
        if self.img_player_zoom:
            self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=self.img_player_zoom)
        elif self.img_player:
            self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=self.img_player)
        else:
            color = "#f0d9a7" if self.player.invulnerable % 2 == 0 else "#ff8080"
            self.canvas.create_oval(sx, sy, sx + sw, sy + sh, fill=color, outline="")

    def draw_enemies(self, ox, oy):
        for enemy in self.enemies:
            if not enemy.alive:
                continue
            x = enemy.x + ox
            y = enemy.y + oy
            sx, sy, sw, sh = self.world_rect_to_screen(x, y, enemy.w, enemy.h)
            if enemy is self.boss and self.img_boss_zoom:
                self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=self.img_boss_zoom)
            elif self.img_enemy_zoom and enemy.kind != "boss":
                self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=self.img_enemy_zoom)
            elif enemy is self.boss and self.img_boss:
                self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=self.img_boss)
            elif self.img_enemy and enemy.kind != "boss":
                self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=self.img_enemy)
            else:
                colors = {
                    "dash": "#aa534d",
                    "orbit": "#7a4cab",
                    "homing": "#4aab8f",
                    "teleport": "#a96c2f",
                    "split": "#bb3355",
                    "boss": "#d4d4d4",
                }
                self.canvas.create_oval(sx, sy, sx + sw, sy + sh, fill=colors.get(enemy.kind, "#ddd"), outline="")
            self.draw_health_bar(sx, sy - 10 * self.camera_zoom, enemy.hp, enemy.max_hp, sw)

    def draw_projectiles(self, ox, oy):
        for projectile in self.projectiles:
            x = projectile.x + ox
            y = projectile.y + oy
            sx, sy, sw, sh = self.world_rect_to_screen(x, y, projectile.w, projectile.h)
            self.canvas.create_oval(sx, sy, sx + sw, sy + sh, fill=projectile.color, outline="")

    def draw_blood_particles(self, ox, oy):
        for particle in self.blood_particles:
            x = particle.x + ox
            y = particle.y + oy
            size = 3 + max(0, particle.life // 25)
            sx, sy = self.world_to_screen(x, y)
            s = size * self.camera_zoom
            self.canvas.create_oval(sx, sy, sx + s, sy + s, fill=particle.color, outline="")

    def draw_pickups(self, ox, oy):
        for pickup in self.pickups:
            if not pickup.alive:
                continue
            x = pickup.x + ox
            y = pickup.y + oy
            sx, sy, sw, sh = self.world_rect_to_screen(x, y, pickup.w, pickup.h)
            if pickup.kind == "heal" and self.img_heal_zoom:
                image = self.img_heal_zoom
            elif pickup.kind == "special" and self.img_special_zoom:
                image = self.img_special_zoom
            elif pickup.kind == "collect" and self.img_collect_zoom:
                image = self.img_collect_zoom
            elif pickup.kind == "objective" and self.img_objective_zoom:
                image = self.img_objective_zoom
            elif pickup.kind == "heal" and self.img_heal:
                image = self.img_heal
            elif pickup.kind == "special" and self.img_special:
                image = self.img_special
            elif pickup.kind == "collect" and self.img_collect:
                image = self.img_collect
            elif pickup.kind == "objective" and self.img_objective:
                image = self.img_objective
            else:
                image = None
            if image:
                self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=image)
            else:
                fill = {
                    "heal": "#76ff93",
                    "special": "#ff9f5c",
                    "collect": "#d6cf7f",
                    "objective": "#f1d4ff",
                    "key": "#d7c35a",
                }.get(pickup.kind, "#fff")
                if pickup.kind == "key":
                    self.canvas.create_oval(sx, sy, sx + sw, sy + sh, fill=fill, outline="#8d7420", width=max(1, int(2 * self.camera_zoom)))
                    self.canvas.create_rectangle(sx + sw * 0.45, sy + sh * 0.35, sx + sw * 0.70, sy + sh * 0.55, fill="#8d7420", outline="")
                else:
                    self.canvas.create_rectangle(sx, sy, sx + sw, sy + sh, fill=fill, outline="")

    def draw_objective(self, ox, oy):
        if self.objective and self.objective.alive:
            x = self.objective.x + ox
            y = self.objective.y + oy
            sx, sy, sw, sh = self.world_rect_to_screen(x, y, self.objective.w, self.objective.h)
            if self.level_index >= len(self.levels) - 1 and self.keys_collected < self.keys_total:
                self.canvas.create_rectangle(sx, sy, sx + sw, sy + sh, fill="#3b2230", outline="#795866", width=max(1, int(2 * self.camera_zoom)))
                for i in range(self.keys_total):
                    lx = sx + 4 * self.camera_zoom + i * ((sw - 8 * self.camera_zoom) / self.keys_total)
                    self.canvas.create_rectangle(lx, sy - 10 * self.camera_zoom, lx + 6 * self.camera_zoom, sy + 10 * self.camera_zoom, fill="#d7c35a", outline="#8d7420")
                return
            if self.door_open and self.img_objective_zoom:
                self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=self.img_objective_zoom)
            elif self.door_open and self.img_objective:
                self.canvas.create_image(sx + sw / 2, sy + sh / 2, image=self.img_objective)
            else:
                fill = "#b8a8ff" if self.door_open else "#5a3d4d"
                outline = "#efe3ff" if self.door_open else "#1d1118"
                self.canvas.create_rectangle(sx, sy, sx + sw, sy + sh, fill=fill, outline=outline, width=max(1, int(2 * self.camera_zoom)))
                if not self.door_open:
                    self.canvas.create_line(sx + 4 * self.camera_zoom, sy + 4 * self.camera_zoom, sx + sw - 4 * self.camera_zoom, sy + sh - 4 * self.camera_zoom, fill="#24131b")
                    self.canvas.create_line(sx + sw - 4 * self.camera_zoom, sy + 4 * self.camera_zoom, sx + 4 * self.camera_zoom, sy + sh - 4 * self.camera_zoom, fill="#24131b")

    def draw_health_bar(self, x, y, hp, max_hp, width):
        ratio = max(0, hp) / max(1, max_hp)
        bar_h = 6 * self.camera_zoom
        self.canvas.create_rectangle(x, y, x + width, y + bar_h, fill="#30161b", outline="")
        self.canvas.create_rectangle(x, y, x + width * ratio, y + bar_h, fill="#c74343", outline="")

    def draw_hud(self):
        self.canvas.create_rectangle(0, 0, self.width, 56, fill="#0a070c", outline="")
        self.canvas.create_text(
            20,
            22,
            anchor="w",
            text="Vida: {}/{}   Pontos: {}".format(self.player.hp, self.player.max_hp, self.score),
            fill="#f6e5d8",
            font=("Consolas", 17, "bold"),
        )
        level_text = self.current_level[0] if self.current_level else "Prologo"
        self.canvas.create_text(
            20,
            40,
            anchor="w",
            text="Nivel: {}  Coletaveis: {}/{}  Chaves: {}/{}".format(level_text, self.collectibles_collected, self.collectibles_total, self.keys_collected, self.keys_total),
            fill="#8d8585",
            font=("Consolas", 11),
        )
        self.canvas.create_text(
            self.width - 20,
            22,
            anchor="e",
            text="A/D mover | W ou Space saltar | X atacar | Shift especial | F11 fullscreen | Esc pausar",
            fill="#a68e7d",
            font=("Consolas", 11),
        )

    def draw_button(self, x, y, w, h, text, action, fill="#2b1d24", outline="#8b6574", level_index=None, locked=False):
        self.canvas.create_rectangle(x, y, x + w, y + h, fill=fill, outline=outline, width=2)
        self.canvas.create_text(x + w / 2, y + h / 2, text=text, fill="#f5e7d8", font=("Consolas", 16, "bold"))
        button = {"x1": x, "y1": y, "x2": x + w, "y2": y + h, "action": action}
        if level_index is not None:
            button["level_index"] = level_index
        if locked:
            button["locked"] = True
        self.ui_buttons.append(button)

    def draw_overlay(self, title, subtitle):
        self.canvas.create_rectangle(0, 0, self.width, self.height, fill="#000000", outline="", stipple="gray50")
        self.canvas.create_rectangle(
            self.width * 0.28,
            self.height * 0.28,
            self.width * 0.72,
            self.height * 0.58,
            fill="#140d13",
            outline="#6d4b4b",
            width=2,
        )
        self.canvas.create_text(self.width * 0.5, self.height * 0.38, text=title, fill="#f0dfcf", font=("Georgia", 34, "bold"))
        self.canvas.create_text(self.width * 0.5, self.height * 0.48, text=subtitle, fill="#d7c6ba", font=("Consolas", 16))

    def loop(self):
        if not self.running:
            return
        if self.state == "playing":
            self.update()
        self.draw()
        self.root.after(FPS_MS, self.loop)


if __name__ == "__main__":
    Game().root.mainloop()
