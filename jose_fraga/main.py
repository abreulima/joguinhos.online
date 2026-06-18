import json
import math
import os
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pygame


WIDTH = 960
HEIGHT = 540
FPS = 60
TILE = 32
ROOM_W = 48
ROOM_H = 17
ROOM_PIXEL_W = ROOM_W * TILE
ROOM_PIXEL_H = ROOM_H * TILE
PICKUP_SIZE = 22

GRAVITY = 0.40
MOVE_ACCEL = 0.55
MAX_MOVE_SPEED = 5.0
GROUND_FRICTION = 0.80
AIR_FRICTION = 0.94
JUMP_SPEED = 12.8
MAX_FALL_SPEED = 14.0
DASH_SPEED = 12.5
MELEE_COOLDOWN = 0.24
MELEE_ACTIVE_TIME = 1.0
RANGED_COOLDOWN = 0.42
DASH_COOLDOWN = 0.75
INVULN_TIME = 0.65
PROJECTILE_SPEED = 10

BASE_DIR = Path(__file__).resolve().parent
ASSET_DIR = BASE_DIR / "artes"
SAVE_FILE = BASE_DIR / "saves.json"


def clamp(value, low, high):
    return max(low, min(high, value))


def sign(value):
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


def load_image(name, size=None, alpha=True, fallback=(255, 0, 255)):
    path = ASSET_DIR / name
    if path.exists():
        image = pygame.image.load(str(path))
        image = image.convert_alpha() if alpha else image.convert()
        if size:
            image = pygame.transform.smoothscale(image, size)
        return image
    surf = pygame.Surface(size or (32, 32), pygame.SRCALPHA)
    surf.fill(fallback)
    return surf


def make_text(font, text, color=(255, 255, 255)):
    return font.render(text, True, color)


def rect_from_tile(x, y, w=1, h=1):
    return pygame.Rect(x * TILE, y * TILE, w * TILE, h * TILE)


def save_game(data):
    payload = {"slots": {}}
    if SAVE_FILE.exists():
        try:
            payload = json.loads(SAVE_FILE.read_text(encoding="utf-8"))
        except Exception:
            payload = {"slots": {}}
    payload.setdefault("slots", {})
    payload["slots"][str(data["slot"])] = data
    SAVE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_all_saves():
    if not SAVE_FILE.exists():
        return {"slots": {}}
    try:
        payload = json.loads(SAVE_FILE.read_text(encoding="utf-8"))
        payload.setdefault("slots", {})
        return payload
    except Exception:
        return {"slots": {}}


def delete_save(slot):
    payload = load_all_saves()
    slots = payload.get("slots", {})
    if str(slot) in slots:
        del slots[str(slot)]
        SAVE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


@dataclass
class Pickup:
    kind: str
    pos: pygame.Vector2
    pid: str
    rect: pygame.Rect = field(init=False)
    collected: bool = False

    def __post_init__(self):
        self.rect = pygame.Rect(self.pos.x, self.pos.y, PICKUP_SIZE, PICKUP_SIZE)


@dataclass
class Projectile:
    rect: pygame.Rect
    vel: pygame.Vector2
    damage: int
    owner: str
    life: float = 2.0

    def update(self, solids):
        self.rect.x += int(self.vel.x)
        hit = self._collide(solids)
        self.rect.y += int(self.vel.y)
        hit = self._collide(solids) or hit
        self.life -= 1 / FPS
        return hit or self.life <= 0

    def _collide(self, solids):
        for solid in solids:
            if self.rect.colliderect(solid):
                return True
        return False

    def draw(self, surf, camera_x, camera_y, sprite):
        surf.blit(sprite, (self.rect.x - camera_x, self.rect.y - camera_y))




class Enemy:
    def __init__(self, kind, x, y, spawn_delay=0.0):
        self.kind = kind
        self.rect = pygame.Rect(x, y, 38, 38)
        self.vel = pygame.Vector2(0, 0)
        self.facing = -1
        self.hp = 3 if kind == "grunt" else 4
        self.cooldown = random.uniform(0.4, 1.0)
        self.on_ground = False
        self.dead = False
        self.spawn_delay = spawn_delay
        self.active = spawn_delay <= 0

    def update(self, game, room, solids):
        if self.dead:
            return []
        if not self.active:
            self.spawn_delay -= 1 / FPS
            if self.spawn_delay > 0:
                return []
            self.active = True
        if not game.player_has_moved:
            self.vel.x = 0
            self.vel.y = 0
            return []

        player = game.player
        projectiles = []
        distance = abs(player.rect.centerx - self.rect.centerx)
        self.facing = sign(player.rect.centerx - self.rect.centerx) or self.facing

        if self.kind == "grunt":
            if distance <= 240:
                self.vel.x += 0.12 * self.facing
                self.vel.x = clamp(self.vel.x, -2.2, 2.2)
            else:
                self.vel.x *= 0.85
        else:
            if distance <= 280:
                if distance > 160:
                    self.vel.x += 0.07 * self.facing
                else:
                    self.vel.x -= 0.06 * self.facing
                self.vel.x = clamp(self.vel.x, -1.8, 1.8)
                self.cooldown -= 1 / FPS
                if self.cooldown <= 0 and distance < 320:
                    self.cooldown = 1.4
                    shot_dir = sign(player.rect.centerx - self.rect.centerx) or self.facing
                    proj_rect = pygame.Rect(self.rect.centerx, self.rect.centery - 4, 12, 12)
                    projectiles.append(Projectile(proj_rect, pygame.Vector2(shot_dir * PROJECTILE_SPEED, 0), 1, "enemy"))
            else:
                self.vel.x *= 0.85

        if self.on_ground:
            self.vel.x *= 0.9
        self.vel.y = min(self.vel.y + GRAVITY, MAX_FALL_SPEED)

        self._move(self.vel.x, 0, solids)
        self.on_ground = self._move(0, self.vel.y, solids)

        if abs(self.vel.x) < 0.05:
            self.vel.x = 0

        if self.rect.colliderect(player.rect) and not player.invuln and not player.dashing:
            player.take_hit(1, self.rect.centerx)

        return projectiles

    def _move(self, dx, dy, solids):
        self.rect.x += int(dx)
        collided = False
        for solid in solids:
            if self.rect.colliderect(solid):
                collided = True
                if dx > 0:
                    self.rect.right = solid.left
                elif dx < 0:
                    self.rect.left = solid.right
                self.vel.x = 0

        self.rect.y += int(dy)
        grounded = False
        for solid in solids:
            if self.rect.colliderect(solid):
                collided = True
                if dy > 0:
                    self.rect.bottom = solid.top
                    grounded = True
                elif dy < 0:
                    self.rect.top = solid.bottom
                self.vel.y = 0
        return grounded if dy != 0 else collided

    def take_hit(self, damage):
        self.hp -= damage
        if self.hp <= 0:
            self.dead = True

    def draw(self, surf, camera_x, camera_y, sprite):
        if self.dead or not self.active:
            return
        base = pygame.transform.flip(sprite, True, False)
        flipped = pygame.transform.flip(base, self.facing < 0, False)
        surf.blit(pygame.transform.scale(flipped, (50, 50)), (self.rect.x - camera_x - 6, self.rect.y - camera_y - 6))


class Boss:
    def __init__(self, x, y):
        self.rect = pygame.Rect(x, y, 64, 64)
        self.vel = pygame.Vector2(0, 0)
        self.max_hp = 22.5
        self.hp = self.max_hp
        self.facing = -1
        self.phase = 1
        self.cooldown = 1.2
        self.jump_timer = 0.0
        self.dead = False

    def update(self, game, solids):
        if self.dead:
            return []
        if not game.player_has_moved:
            self.vel.x = 0
            self.vel.y = 0
            return []

        player = game.player
        self.facing = sign(player.rect.centerx - self.rect.centerx) or self.facing
        self.phase = 2 if self.hp < (self.max_hp * (2 / 3)) else 1
        projectiles = []
        self.cooldown -= 1 / FPS
        self.jump_timer -= 1 / FPS

        chase_accel = 0.10 if self.phase == 1 else 0.16
        if self.rect.centerx < player.rect.centerx:
            self.vel.x += chase_accel
        else:
            self.vel.x -= chase_accel
        self.vel.x = clamp(self.vel.x, -2.6 if self.phase == 1 else -3.8, 2.6 if self.phase == 1 else 3.8)

        if self.jump_timer <= 0:
            self.vel.y = -14 if self.phase == 1 else -17
            self.jump_timer = 1.8 if self.phase == 1 else 1.15

        if self.cooldown <= 0:
            self.cooldown = 1.45 if self.phase == 1 else 0.95
            spread = [-1, 0, 1] if self.phase == 2 else [0]
            for offset in spread:
                proj_rect = pygame.Rect(self.rect.centerx, self.rect.centery, 14, 14)
                projectiles.append(
                    Projectile(
                        proj_rect,
                        pygame.Vector2((self.facing * PROJECTILE_SPEED) + offset * 1.5, offset * 0.8),
                        1,
                        "boss",
                        2.5,
                    )
                )

        self.vel.y = min(self.vel.y + GRAVITY, MAX_FALL_SPEED)
        self._move(self.vel.x, 0, solids)
        self._move(0, self.vel.y, solids)
        self.vel.x *= 0.92

        if self.rect.colliderect(player.rect) and not player.invuln and not player.dashing:
            player.take_hit(2, self.rect.centerx)

        return projectiles

    def _move(self, dx, dy, solids):
        self.rect.x += int(dx)
        for solid in solids:
            if self.rect.colliderect(solid):
                if dx > 0:
                    self.rect.right = solid.left
                elif dx < 0:
                    self.rect.left = solid.right
                self.vel.x = 0

        self.rect.y += int(dy)
        for solid in solids:
            if self.rect.colliderect(solid):
                if dy > 0:
                    self.rect.bottom = solid.top
                elif dy < 0:
                    self.rect.top = solid.bottom
                self.vel.y = 0

    def take_hit(self, damage):
        self.hp -= damage
        if self.hp <= 0:
            self.dead = True

    def draw(self, surf, camera_x, camera_y, sprite):
        if self.dead:
            return
        flipped = pygame.transform.flip(sprite, self.facing < 0, False)
        surf.blit(
            pygame.transform.scale(flipped, (96, 96)),
            (self.rect.x - camera_x - 16, self.rect.y - camera_y - 16),
        )
        bar_w = 90
        hp_ratio = max(0, self.hp) / self.max_hp
        pygame.draw.rect(surf, (50, 10, 10), (self.rect.x - camera_x - 13, self.rect.y - camera_y - 24, bar_w, 8))
        pygame.draw.rect(surf, (220, 70, 70), (self.rect.x - camera_x - 13, self.rect.y - camera_y - 24, int(bar_w * hp_ratio), 8))


class Player:
    def __init__(self, x, y):
        self.rect = pygame.Rect(x, y, 28, 30)
        self.vel = pygame.Vector2(0, 0)
        self.facing = 1
        self.on_ground = False
        self.coyote = 0.0
        self.jump_buffer = 0.0
        self.invuln = 0.0
        self.dash_time = 0.0
        self.dash_cd = 0.0
        self.melee_cd = 0.0
        self.ranged_cd = 0.0
        self.health = 5
        self.max_health = 5
        self.has_ranged = False
        self.dash_unlocked = False
        self.relics = 0
        self.score = 0
        self.dead = False
        self.dashing = False
        self.dash_dir = 1
        self.extra_jumps = 0
        self.air_jumps_left = 1
        self.melee_anim = 0.0
        self.melee_hit_targets = set()

    def snapshot(self):
        return {
            "x": self.rect.x,
            "y": self.rect.y,
            "hp": self.health,
            "max_hp": self.max_health,
            "has_ranged": self.has_ranged,
            "dash_unlocked": self.dash_unlocked,
            "relics": self.relics,
            "score": self.score,
            "facing": self.facing,
        }

    def restore(self, data):
        self.rect.topleft = (data.get("x", self.rect.x), data.get("y", self.rect.y))
        self.health = data.get("hp", self.health)
        self.max_health = data.get("max_hp", self.max_health)
        self.has_ranged = data.get("has_ranged", self.has_ranged)
        self.dash_unlocked = data.get("dash_unlocked", self.dash_unlocked)
        self.relics = data.get("relics", self.relics)
        self.score = data.get("score", self.score)
        self.facing = data.get("facing", self.facing)
        self.health = clamp(self.health, 0, self.max_health)

    def update(self, game, solids):
        keys = pygame.key.get_pressed()
        axis = 0
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            axis -= 1
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            axis += 1

        if axis:
            self.facing = axis
            self.vel.x += axis * MOVE_ACCEL
        else:
            self.vel.x *= GROUND_FRICTION if self.on_ground else AIR_FRICTION

        self.vel.x = clamp(self.vel.x, -MAX_MOVE_SPEED, MAX_MOVE_SPEED)

        if self.coyote > 0 and self.jump_buffer > 0:
            self.vel.y = -JUMP_SPEED
            self.coyote = 0
            self.jump_buffer = 0

        if self.on_ground:
            self.coyote = 0.12
            self.air_jumps_left = 1
        else:
            self.coyote = max(0, self.coyote - 1 / FPS)

        self.jump_buffer = max(0, self.jump_buffer - 1 / FPS)
        self.melee_cd = max(0, self.melee_cd - 1 / FPS)
        self.melee_anim = max(0, self.melee_anim - 1 / FPS)
        if self.melee_anim <= 0:
            self.melee_hit_targets.clear()
        self.ranged_cd = max(0, self.ranged_cd - 1 / FPS)
        self.invuln = max(0, self.invuln - 1 / FPS)
        self.dash_cd = max(0, self.dash_cd - 1 / FPS)

        if not self.dashing:
            self.vel.y = min(self.vel.y + GRAVITY, MAX_FALL_SPEED)

        if self.dashing:
            self.dash_time -= 1 / FPS
            self.vel.x = self.dash_dir * DASH_SPEED
            self.vel.y = 0
            if self.dash_time <= 0:
                self.dashing = False

        self._move(self.vel.x, 0, solids)
        self.on_ground = self._move(0, self.vel.y, solids)

        if self.rect.left < 0:
            self.rect.left = 0
        if self.rect.right > ROOM_PIXEL_W:
            self.rect.right = ROOM_PIXEL_W

        if self.health <= 0:
            self.dead = True

    def begin_jump(self):
        if self.on_ground or self.coyote > 0:
            self.jump_buffer = 0.15
        elif self.air_jumps_left > 0:
            self.vel.y = -JUMP_SPEED
            self.air_jumps_left -= 1
            self.dashing = False
            self.dash_time = 0
            self.jump_buffer = 0
            self.coyote = 0
        else:
            self.jump_buffer = 0.15

    def begin_melee(self):
        if self.melee_cd > 0:
            return None
        self.melee_cd = MELEE_COOLDOWN
        self.melee_anim = MELEE_ACTIVE_TIME
        self.melee_hit_targets = set()
        return None

    def begin_ranged(self):
        if not self.has_ranged or self.ranged_cd > 0:
            return None
        self.ranged_cd = RANGED_COOLDOWN
        proj_rect = pygame.Rect(self.rect.centerx, self.rect.centery - 5, 12, 12)
        return Projectile(proj_rect, pygame.Vector2(self.facing * PROJECTILE_SPEED, 0), 2, "player")

    def begin_dash(self):
        if not self.dash_unlocked or self.dash_cd > 0 or self.dashing:
            return
        self.dashing = True
        self.dash_time = 0.16
        self.dash_cd = DASH_COOLDOWN
        self.dash_dir = self.facing or 1
        self.invuln = max(self.invuln, 0.15)
        self.vel.y = 0

    def take_hit(self, damage, source_x):
        if self.invuln > 0 or self.dashing:
            return
        self.health -= damage
        self.invuln = INVULN_TIME
        self.vel.x = -sign(source_x - self.rect.centerx) * 5.5
        self.vel.y = -6

    def heal(self, amount):
        self.health = clamp(self.health + amount, 0, self.max_health)

    def _move(self, dx, dy, solids):
        self.rect.x += int(dx)
        for solid in solids:
            if self.rect.colliderect(solid):
                if dx > 0:
                    self.rect.right = solid.left
                elif dx < 0:
                    self.rect.left = solid.right
                self.vel.x = 0

        self.rect.y += int(dy)
        grounded = False
        for solid in solids:
            if self.rect.colliderect(solid):
                if dy > 0:
                    self.rect.bottom = solid.top
                    grounded = True
                elif dy < 0:
                    self.rect.top = solid.bottom
                self.vel.y = 0
        return grounded if dy != 0 else False

    def draw(self, surf, camera_x, camera_y, sprite):
        if self.invuln > 0 and int(self.invuln * 20) % 2 == 0:
            return
        flipped = pygame.transform.flip(sprite, self.facing < 0, False)
        surf.blit(pygame.transform.scale(flipped, (40, 40)), (self.rect.x - camera_x - 6, self.rect.y - camera_y - 8))

    def draw_melee_weapon(self, surf, camera_x, camera_y, weapon_sprite):
        if self.melee_anim <= 0:
            return
        weapon, world_rect = self._melee_weapon_pose(weapon_sprite)
        surf.blit(weapon, (world_rect.x - camera_x, world_rect.y - camera_y))

    def get_melee_hitbox(self, weapon_sprite=None):
        weapon_sprite = weapon_sprite or pygame.Surface((34, 34), pygame.SRCALPHA)
        _, world_rect = self._melee_weapon_pose(weapon_sprite)
        return world_rect

    def _melee_weapon_pose(self, weapon_sprite):
        progress = 1.0 - (self.melee_anim / MELEE_ACTIVE_TIME)
        swing = math.sin(progress * math.pi)
        base_size = 30 + int(10 * swing)
        weapon = pygame.transform.scale(weapon_sprite, (base_size, base_size))
        angle = (-85 + 130 * progress) if self.facing > 0 else (85 - 130 * progress)
        weapon = pygame.transform.rotate(weapon, angle)
        if self.facing > 0:
            x = self.rect.right + 6 + int(18 * swing)
            y = self.rect.y - 6 - int(6 * swing)
        else:
            x = self.rect.left - weapon.get_width() - 6 - int(18 * swing)
            y = self.rect.y - 6 - int(6 * swing)
        return weapon, pygame.Rect(x, y, weapon.get_width(), weapon.get_height())


@dataclass
class Room:
    name: str
    solid_rects: list
    enemy_spawns: list
    pickups: list
    connections: dict
    spawn: tuple
    background_offset: int = 0
    boss_room: bool = False

    def make_enemies(self):
        enemies = []
        for entry in self.enemy_spawns:
            if len(entry) == 4:
                kind, x, y, spawn_delay = entry
            else:
                kind, x, y = entry
                spawn_delay = 0.0
            enemies.append(Enemy(kind, x, y, spawn_delay))
        return enemies


def build_room(name, enemy_spawns, pickups, connections, spawn, platform_specs, wall_specs=None, tall_walls=None, boss_room=False, background_offset=0):
    solids = []

    for x in range(ROOM_W):
        solids.append(rect_from_tile(x, 0))
        solids.append(rect_from_tile(x, ROOM_H - 1))

    door_y_start = 6
    door_y_end = 10
    openings = {
        "left": connections.get("left") is not None,
        "right": connections.get("right") is not None,
    }

    for y in range(1, ROOM_H - 1):
        if not (openings["left"] and door_y_start <= y <= door_y_end):
            solids.append(rect_from_tile(0, y))
        if not (openings["right"] and door_y_start <= y <= door_y_end):
            solids.append(rect_from_tile(ROOM_W - 1, y))

    for x, y, w, h in platform_specs:
        solids.append(rect_from_tile(x, y, w, h))

    def rect_is_free(rect):
        return not any(rect.colliderect(solid) for solid in solids)

    def nudge_to_free(x, y, w, h):
        rect = pygame.Rect(x, y, w, h)
        if rect_is_free(rect):
            return rect.x, rect.y
        for dy in (-TILE, -TILE * 2, -TILE * 3):
            trial = rect.move(0, dy)
            if rect_is_free(trial):
                return trial.x, trial.y
        return rect.x, rect.y

    for x, y, w, h in wall_specs or []:
        wall_overlaps_platform = False
        wall_left = x * TILE
        wall_right = (x + w) * TILE
        for px, py, pw, ph in platform_specs:
            platform_left = px * TILE
            platform_right = (px + pw) * TILE
            if wall_right > platform_left and wall_left < platform_right:
                wall_overlaps_platform = True
                break
        if wall_overlaps_platform:
            continue
        wall_h = max(1, min(h, 3))
        wall_y = ROOM_H - 1 - wall_h
        solids.append(rect_from_tile(x, wall_y, w, wall_h))

    for x, y, w, h in tall_walls or []:
        solids.append(rect_from_tile(x, y, w, h))

    snapped_pickups = []
    for kind, x, y, pid in pickups:
        support_top = None
        fallback_top = None
        pickup_center_x = x + 10
        for px, py, pw, ph in platform_specs:
            tile_left = px * TILE
            tile_right = (px + pw) * TILE
            if tile_left <= pickup_center_x <= tile_right:
                top = py * TILE
                if fallback_top is None or top < fallback_top:
                    fallback_top = top
                if top <= y + 20 and (support_top is None or top > support_top):
                    support_top = top
        if support_top is None:
            support_top = fallback_top
        if support_top is not None:
            y = support_top - PICKUP_SIZE
        x, y = nudge_to_free(x, y, PICKUP_SIZE, PICKUP_SIZE)
        snapped_pickups.append((kind, x, y, pid))

    snapped_enemies = []
    for index, entry in enumerate(enemy_spawns):
        if len(entry) == 4:
            kind, x, y, spawn_delay = entry
        else:
            kind, x, y = entry
            spawn_delay = 0.0
        min_spawn_x = ROOM_PIXEL_W // 3 + 24
        if x < min_spawn_x:
            x = min_spawn_x + index * 28
        enemy_center_x = x + 19
        support_top = None
        fallback_top = None
        for px, py, pw, ph in platform_specs:
            tile_left = px * TILE
            tile_right = (px + pw) * TILE
            if tile_left <= enemy_center_x <= tile_right:
                top = py * TILE
                if fallback_top is None or top < fallback_top:
                    fallback_top = top
                if top <= y + 32 and (support_top is None or top > support_top):
                    support_top = top
        if support_top is None:
            support_top = fallback_top
        if support_top is not None:
            y = support_top - 38
        x, y = nudge_to_free(x, y, 38, 38)
        snapped_enemies.append((kind, x, y, spawn_delay))

    return Room(name, solids, snapped_enemies, snapped_pickups, connections, spawn, background_offset, boss_room)


def make_rooms():
    rooms = {}

    rooms["room1"] = build_room(
        "room1",
        [("grunt", 220, 430), ("grunt", 560, 430)],
        [("heal", 420, 380, "r1_heal")],
        {"right": "room2"},
        (100, 390),
        [(6, 12, 10, 1), (20, 10, 8, 1), (34, 8, 7, 1)],
        wall_specs=[(10, 5, 2, 7), (26, 7, 2, 5)],
        background_offset=0,
    )

    rooms["room2"] = build_room(
        "room2",
        [("grunt", 260, 430), ("archer", 730, 430), ("grunt", 1140, 430)],
        [("heal", 1130, 332, "r2_heal")],
        {"left": "room1", "right": "room3"},
        (80, 390),
        [(5, 11, 8, 1), (16, 9, 10, 1), (31, 11, 8, 1), (38, 7, 4, 1)],
        wall_specs=[(12, 6, 2, 4), (23, 4, 2, 6), (36, 9, 2, 3)],
        background_offset=48,
    )

    rooms["room3"] = build_room(
        "room3",
        [("grunt", 280, 430), ("grunt", 800, 430), ("archer", 1210, 350)],
        [("dash", 1020, 240, "r3_dash")],
        {"left": "room2", "right": "room4"},
        (100, 390),
        [(7, 12, 8, 1), (18, 9, 6, 1), (28, 7, 7, 1), (39, 10, 5, 1)],
        wall_specs=[(9, 3, 2, 6), (20, 8, 2, 4), (32, 5, 2, 7)],
        background_offset=96,
    )

    rooms["room4"] = build_room(
        "room4",
        [("grunt", 240, 430), ("archer", 640, 350), ("grunt", 1060, 430), ("grunt", 1300, 430)],
        [("heal", 700, 300, "r4_heal")],
        {"left": "room3", "right": "room5"},
        (80, 390),
        [(5, 11, 10, 1), (19, 10, 7, 1), (31, 8, 8, 1), (40, 12, 4, 1)],
        wall_specs=[(14, 6, 2, 5), (24, 3, 2, 8), (34, 7, 2, 4)],
        background_offset=144,
    )

    rooms["room5"] = build_room(
        "room5",
        [("grunt", 340, 430), ("archer", 760, 350), ("grunt", 1190, 430), ("archer", 1360, 350)],
        [("ranged", 940, 332, "r5_ranged")],
        {"left": "room4", "right": "room6"},
        (80, 390),
        [(4, 12, 8, 1), (15, 9, 7, 1), (25, 11, 9, 1), (37, 8, 7, 1)],
        wall_specs=[(8, 7, 2, 5), (18, 4, 2, 7), (30, 6, 2, 5), (41, 5, 1, 6)],
        background_offset=192,
    )

    rooms["room6"] = build_room(
        "room6",
        [("grunt", 240, 430), ("grunt", 520, 430), ("archer", 820, 350), ("grunt", 1180, 430), ("archer", 1380, 350)],
        [("relic", 1010, 300, "r6_relic")],
        {"left": "room5", "right": "room7"},
        (80, 390),
        [(6, 11, 7, 1), (15, 8, 7, 1), (25, 10, 10, 1), (37, 12, 7, 1)],
        wall_specs=[(10, 5, 2, 6), (22, 7, 2, 4), (33, 3, 2, 8)],
        background_offset=240,
    )

    rooms["room7"] = build_room(
        "room7",
        [("grunt", 280, 430), ("archer", 660, 350), ("grunt", 950, 430), ("grunt", 1180, 430), ("archer", 1410, 350)],
        [("hpup", 720, 300, "r7_hp")],
        {"left": "room6", "right": "room8"},
        (80, 390),
        [(5, 12, 9, 1), (18, 10, 7, 1), (29, 8, 8, 1), (40, 11, 5, 1)],
        wall_specs=[(12, 4, 2, 7), (27, 6, 2, 5), (38, 3, 2, 8)],
        background_offset=288,
    )

    rooms["room8"] = build_room(
        "room8",
        [("grunt", 240, 430), ("grunt", 520, 430), ("archer", 800, 350), ("grunt", 1040, 430), ("archer", 1320, 350), ("grunt", 1420, 430)],
        [("relic", 1240, 240, "r8_relic")],
        {"left": "room7", "right": "room9"},
        (80, 390),
        [(6, 12, 9, 1), (16, 9, 7, 1), (27, 11, 7, 1), (37, 8, 8, 1)],
        wall_specs=[(9, 6, 2, 4), (20, 3, 2, 8), (32, 7, 2, 4)],
        background_offset=336,
    )

    rooms["room9"] = build_room(
        "room9",
        [("grunt", 240, 430), ("archer", 540, 350), ("grunt", 830, 430), ("archer", 1120, 350), ("grunt", 1360, 430)],
        [("relic", 840, 364, "r9_relic")],
        {"left": "room8", "right": "room10"},
        (80, 390),
        [(4, 11, 8, 1), (14, 9, 7, 1), (24, 12, 8, 1), (35, 8, 8, 1)],
        wall_specs=[(11, 4, 2, 7), (22, 8, 2, 4), (34, 5, 2, 6)],
        background_offset=384,
    )

    rooms["room10"] = build_room(
        "room10",
        [("grunt", 260, 430), ("grunt", 520, 430), ("archer", 760, 350), ("grunt", 1020, 430), ("archer", 1240, 350), ("grunt", 1400, 430)],
        [("objective", 1360, 236, "boss_gate")],
        {"left": "room9", "right": "room11"},
        (80, 390),
        [(5, 12, 7, 1), (15, 9, 7, 1), (25, 11, 7, 1), (36, 8, 8, 1)],
        wall_specs=[(9, 6, 2, 5), (20, 4, 2, 7), (31, 6, 2, 5), (41, 3, 1, 8)],
        background_offset=432,
    )

    rooms["room11"] = build_room(
        "room11",
        [],
        [("bossseal", 1160, 220, "bossseal")],
        {"left": "room10"},
        (80, 390),
        [(5, 12, 9, 1), (17, 9, 6, 1), (29, 11, 8, 1), (39, 8, 6, 1)],
        wall_specs=[(10, 5, 2, 6), (22, 3, 2, 8), (34, 5, 2, 6)],
        background_offset=480,
        boss_room=True,
    )

    return rooms


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Never Gamble")
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT), pygame.FULLSCREEN | pygame.SCALED)
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("arial", 22)
        self.big_font = pygame.font.SysFont("arial", 42, bold=True)
        self.huge_font = pygame.font.SysFont("arial", 68, bold=True)

        self.images = {
            "player": load_image("jogador.png"),
            "grunt": load_image("inimigo.png"),
            "archer": load_image("inimigo2.png"),
            "boss": load_image("boss.png"),
            "relic": load_image("coletavel.png"),
            "heal": load_image("cocomelo.png"),
            "dash": load_image("especial.png"),
            "drill": load_image("arma.png"),
            "hpup": load_image("vida.png"),
            "objective": load_image("objetivo.png"),
            "bossseal": load_image("objetivo.png"),
            "heart": load_image("vida.png"),
            "menu": load_image("capa.png", (WIDTH, HEIGHT), True),
            "grass_top": load_image("relvatopo.png"),
            "grass_mid": load_image("relvameio.png"),
            "atq1": load_image("atq1.png"),
            "atq2": load_image("atq2.png"),
            "atq3": load_image("atq3.png"),
            "atq4": load_image("atq4.png"),

        }

        
        self.menu_bg = pygame.transform.smoothscale(self.images["menu"], (WIDTH, HEIGHT))
        self.rooms = make_rooms()
        self.particles = []
        self.projectiles = []
        self.room = self.rooms["room1"]
        self.player = Player(*self.room.spawn)
        self.enemies = self.room.make_enemies()
        self.boss = None
        self.collected_pickups = set()
        self.pickups = self._clone_pickups(self.room.pickups)
        self.player_has_moved = False
        self.state = "menu"
        self.current_slot = 1
        self.menu_message = ""
        self.save_payload = load_all_saves()
        self.tutorial_scroll = 0
        self.boss_defeated = False
        self.music_hint = False
        self.wall_top = self.make_wall_tile((98, 86, 72), (145, 130, 110), (62, 52, 44))
        self.wall_mid = self.make_wall_tile((78, 68, 58), (120, 108, 92), (50, 42, 36))
        self.images["player_shot"] = self.make_projectile_texture((235, 200, 90), (255, 244, 180), (110, 70, 20))
        self.images["enemy_shot"] = self.make_projectile_texture((220, 80, 80), (255, 170, 170), (110, 25, 25))

    def make_wall_tile(self, base_color, accent_color, shadow_color):
        tile = pygame.Surface((TILE, TILE), pygame.SRCALPHA)
        tile.fill(base_color)
        for x in range(0, TILE, 8):
            for y in range(0, TILE, 8):
                if (x + y) % 16 == 0:
                    pygame.draw.rect(tile, accent_color, (x, y, 8, 8), 1)
                else:
                    pygame.draw.rect(tile, shadow_color, (x, y, 8, 8), 1)
        pygame.draw.line(tile, (160, 150, 135), (0, 2), (TILE, 2), 2)
        pygame.draw.line(tile, (40, 32, 28), (0, TILE - 2), (TILE, TILE - 2), 2)
        return tile

    def make_projectile_texture(self, core_color, glow_color, shadow_color):
        surf = pygame.Surface((22, 12), pygame.SRCALPHA)
        pygame.draw.ellipse(surf, (*glow_color, 150), (0, 1, 22, 10))
        pygame.draw.ellipse(surf, (*shadow_color, 220), (3, 3, 16, 6))
        pygame.draw.ellipse(surf, (*core_color, 255), (6, 2, 10, 8))
        pygame.draw.circle(surf, (255, 255, 255, 220), (15, 5), 2)
        pygame.draw.line(surf, (*glow_color, 170), (1, 6), (21, 6), 2)
        return surf

    def _clone_pickups(self, pickup_defs):
        pickups = []
        for kind, x, y, pid in pickup_defs:
            pickup = Pickup(kind, pygame.Vector2(x, y), pid)
            if pid in self.collected_pickups:
                pickup.collected = True
            pickups.append(pickup)
        return pickups

    def start_new(self, slot):
        self.current_slot = slot
        self.player = Player(*self.rooms["room1"].spawn)
        self.room = self.rooms["room1"]
        self.enemies = self.room.make_enemies()
        self.collected_pickups = set()
        self.pickups = self._clone_pickups(self.room.pickups)
        self.projectiles = []
        self.boss = None
        self.boss_defeated = False
        self.player_has_moved = False
        self.state = "play"
        self.menu_message = f"Novo jogo iniciado no save {slot}."
        self.auto_save()

    def load_slot(self, slot):
        payload = self.save_payload.get("slots", {}).get(str(slot))
        if not payload:
            self.start_new(slot)
            return
        self.current_slot = slot
        self.player = Player(*self.rooms["room1"].spawn)
        self.player.restore(payload)
        self.room = self.rooms.get(payload.get("room", "room1"), self.rooms["room1"])
        self.enemies = self.room.make_enemies()
        self.collected_pickups = set(payload.get("collected", []))
        self.pickups = self._clone_pickups(self.room.pickups)
        self.projectiles = []
        self.boss = None
        self.boss_defeated = payload.get("boss_defeated", False)
        self.player_has_moved = False
        if self.room.boss_room and not self.boss_defeated:
            self.boss = Boss(1140, 332)
        self.state = "play"
        self.menu_message = f"Save {slot} carregado."

    def auto_save(self):
        if self.state != "play":
            return
        data = self.player.snapshot()
        data.update(
            {
                "slot": self.current_slot,
                "room": self.room.name,
                "collected": sorted(self.collected_pickups),
                "boss_defeated": self.boss_defeated,
                "time": pygame.time.get_ticks(),
            }
        )
        save_game(data)
        self.save_payload = load_all_saves()

    def enter_room(self, next_room_name, from_side):
        next_room = self.rooms[next_room_name]
        self.room = next_room
        self.enemies = next_room.make_enemies()
        self.pickups = self._clone_pickups(next_room.pickups)
        self.projectiles = []
        if next_room.boss_room and self.boss_defeated:
            self.boss = None
        elif next_room.boss_room:
            self.boss = Boss(1140, 332)
        else:
            self.boss = None

        if from_side == "left":
            self.player.rect.left = ROOM_PIXEL_W - 110
            self.player.facing = -1
        elif from_side == "right":
            self.player.rect.left = 70
            self.player.facing = 1
        else:
            self.player.rect.topleft = next_room.spawn

        if self.room.name == "room11" and self.boss_defeated:
            self.player.rect.topleft = (100, 390)

        self.auto_save()

    def draw_tile_rect(self, surf, rect, camera_x, camera_y, top_variant=False):
        x0 = rect.x - camera_x
        y0 = rect.y - camera_y
        w_tiles = max(1, rect.width // TILE)
        h_tiles = max(1, rect.height // TILE)
        for yy in range(h_tiles):
            for xx in range(w_tiles):
                px = x0 + xx * TILE
                py = y0 + yy * TILE
                if yy == 0:
                    surf.blit(self.wall_top, (px, py))
                else:
                    surf.blit(self.wall_mid, (px, py))

    def draw_room(self):
        camera_x = clamp(self.player.rect.centerx - WIDTH // 2, 0, ROOM_PIXEL_W - WIDTH)
        camera_y = 0
        self.screen.fill((18, 18, 24))

        for solid in self.room.solid_rects:
            if solid.right < camera_x or solid.left > camera_x + WIDTH:
                continue
            self.draw_tile_rect(self.screen, solid, camera_x, camera_y)

        for pickup in self.pickups:
            if pickup.collected:
                continue
            sprite_name = pickup.kind if pickup.kind in self.images else "relic"
            image = pygame.transform.scale(self.images[sprite_name], (22, 22))
            self.screen.blit(image, (pickup.rect.x - camera_x, pickup.rect.y - camera_y))

        for projectile in self.projectiles:
            sprite = self.images["player_shot"] if projectile.owner == "player" else self.images["enemy_shot"]
            projectile.draw(self.screen, camera_x, camera_y, sprite)

        for enemy in self.enemies:
            if enemy.kind == "grunt":
                sprite = self.images["grunt"]
            else:
                sprite = self.images["archer"]
            enemy.draw(self.screen, camera_x, camera_y, sprite)

        if self.boss:
            self.boss.draw(self.screen, camera_x, camera_y, self.images["boss"])

        self.player.draw(self.screen, camera_x, camera_y, self.images["player"])
        self.player.draw_melee_weapon(self.screen, camera_x, camera_y, self.images["atq1"])
        self.draw_hud()

    def draw_hud(self):
        pygame.draw.rect(self.screen, (20, 20, 25), (12, 10, 270, 72), border_radius=10)
        for i in range(self.player.max_health):
            heart = pygame.transform.scale(self.images["heart"], (20, 20))
            x = 22 + i * 24
            y = 22
            if i < self.player.health:
                self.screen.blit(heart, (x, y))
            else:
                faded = heart.copy()
                faded.set_alpha(80)
                self.screen.blit(faded, (x, y))

        text = self.font.render(
            f"Sala: {self.room.name}  Reliquias: {self.player.relics}/3  Dash: {'Sim' if self.player.dash_unlocked else 'Nao'}  Distancia: {'Sim' if self.player.has_ranged else 'Nao'}",
            True,
            (240, 240, 240),
        )
        self.screen.blit(text, (16, 48))

        if self.room.name == "room10" and self.player.relics < 3:
            msg = self.font.render("Colete 3 reliquias para abrir a porta do boss.", True, (255, 215, 120))
            self.screen.blit(msg, (16, HEIGHT - 34))

    def update_play(self):
        keys = pygame.key.get_pressed()
        if keys[pygame.K_ESCAPE]:
            self.state = "menu"
            self.menu_message = "Jogo pausado."
            self.auto_save()
            return

        previous_pos = self.player.rect.topleft
        self.player.update(self, self.room.solid_rects)
        if self.player.rect.topleft != previous_pos:
            self.player_has_moved = True
        if self.player.dead:
            self.state = "gameover"
            return

        self._update_melee_attack()

        if self.player.rect.bottom >= ROOM_PIXEL_H - 2:
            self.player.rect.bottom = ROOM_PIXEL_H - 2

        if self.player.rect.right >= ROOM_PIXEL_W:
            next_room = self.room.connections.get("right")
            if next_room:
                if self.room.name == "room10" and self.player.relics < 3:
                    self.player.rect.right = ROOM_PIXEL_W - 10
                else:
                    self.enter_room(next_room, "right")
                    return

        if self.player.rect.left <= 0:
            next_room = self.room.connections.get("left")
            if next_room:
                self.enter_room(next_room, "left")
                return

        if self.player.rect.top <= 0 and self.room.connections.get("up"):
            self.enter_room(self.room.connections["up"], "up")
            return
        if self.player.rect.bottom >= ROOM_PIXEL_H and self.room.connections.get("down"):
            self.enter_room(self.room.connections["down"], "down")
            return

        if self.player.rect.y > ROOM_PIXEL_H + 120:
            self.player.take_hit(1, self.player.rect.centerx)

        if self.room.name == "room10" and self.player.relics >= 3 and self.player.rect.right >= ROOM_PIXEL_W - 2:
            self.enter_room("room11", "right")
            return

        spawned_projectiles = []

        if self.player.on_ground and pygame.key.get_pressed()[pygame.K_s]:
            self.player.vel.y = 5

        self._update_enemies(spawned_projectiles)
        self._update_projectiles(spawned_projectiles)
        self._update_pickups()
        self._update_boss(spawned_projectiles)
        self._spawn_particles()
        self.projectiles.extend(spawned_projectiles)
        self.projectiles = [p for p in self.projectiles if p.life > 0]
        self.particles = [p for p in self.particles if p[2] > 0]

        if self.boss_defeated and self.room.name == "room11":
            self.state = "victory"

        self.auto_save()

    def _melee_hit(self, hitbox):
        for enemy in self.enemies:
            if not enemy.dead and hitbox.colliderect(enemy.rect):
                enemy.take_hit(2)
        if self.boss and not self.boss.dead and hitbox.colliderect(self.boss.rect):
            self.boss.take_hit(2)

    def _update_melee_attack(self):
        if self.player.melee_anim <= 0:
            return
        hitbox = self.player.get_melee_hitbox(self.images["drill"])
        for enemy in self.enemies:
            if enemy.dead:
                continue
            if id(enemy) in self.player.melee_hit_targets:
                continue
            if hitbox.colliderect(enemy.rect):
                enemy.take_hit(2)
                self.player.melee_hit_targets.add(id(enemy))
        if self.boss and not self.boss.dead and "boss" not in self.player.melee_hit_targets and hitbox.colliderect(self.boss.rect):
            self.boss.take_hit(2)
            self.player.melee_hit_targets.add("boss")

    def _update_enemies(self, spawned_projectiles):
        for enemy in self.enemies:
            spawned = enemy.update(self, self.room, self.room.solid_rects)
            spawned_projectiles.extend(spawned)
            if enemy.dead:
                self.player.score += 100
                if random.random() < 0.18:
                    self.pickups.append(Pickup("heal", pygame.Vector2(enemy.rect.x, enemy.rect.y - 8), f"drop_{random.random()}"))
        self.enemies = [e for e in self.enemies if not e.dead]

    def _update_boss(self, spawned_projectiles):
        if not self.boss:
            return
        if self.boss.dead:
            self.boss_defeated = True
            self.player.score += 1000
            if not any(p.kind == "objective" for p in self.pickups):
                self.pickups.append(Pickup("objective", pygame.Vector2(1170, 220), "boss_treasure"))
            return
        spawned = self.boss.update(self, self.room.solid_rects)
        spawned_projectiles.extend(spawned)

    def _update_projectiles(self, spawned_projectiles):
        for projectile in list(self.projectiles):
            if projectile.update(self.room.solid_rects):
                projectile.life = 0
                continue
            if projectile.owner == "player":
                hit = False
                for enemy in self.enemies:
                    if not enemy.dead and projectile.rect.colliderect(enemy.rect):
                        enemy.take_hit(projectile.damage)
                        projectile.life = 0
                        hit = True
                        self.player.score += 25
                        break
                if not hit and self.boss and not self.boss.dead and projectile.rect.colliderect(self.boss.rect):
                    self.boss.take_hit(projectile.damage)
                    projectile.life = 0
            else:
                if projectile.rect.colliderect(self.player.rect):
                    self.player.take_hit(projectile.damage, projectile.rect.centerx)
                    projectile.life = 0

    def _update_pickups(self):
        for pickup in self.pickups:
            if pickup.collected:
                continue
            if self.player.rect.colliderect(pickup.rect):
                pickup.collected = True
                self.collected_pickups.add(pickup.pid)
                if pickup.kind == "heal":
                    self.player.heal(2)
                elif pickup.kind == "relic":
                    self.player.relics += 1
                elif pickup.kind == "ranged":
                    self.player.has_ranged = True
                elif pickup.kind == "dash":
                    self.player.dash_unlocked = True
                elif pickup.kind == "hpup":
                    self.player.max_health += 1
                    self.player.health = self.player.max_health
                elif pickup.kind == "objective" and self.room.name == "room10":
                    self.player.relics = max(self.player.relics, 3)

    def _spawn_particles(self):
        if self.player.dashing:
            self.particles.append([self.player.rect.centerx, self.player.rect.centery, 12])
        for particle in self.particles:
            particle[2] -= 1

    def draw_menu(self):
        self.screen.blit(self.menu_bg, (0, 0))
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((10, 12, 24, 170))
        self.screen.blit(overlay, (0, 0))

        title = self.huge_font.render("Never Gamble", True, (245, 230, 160))
        subtitle = self.font.render("Um metroidvania sobre um rei, azar e um tesouro perdido", True, (230, 230, 230))
        self.screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 28))
        self.screen.blit(subtitle, (WIDTH // 2 - subtitle.get_width() // 2, 104))

        slots = load_all_saves().get("slots", {})
        for i in range(3):
            slot_num = i + 1
            rect = pygame.Rect(180, 170 + i * 92, 600, 66)
            mouse = pygame.mouse.get_pos()
            hovered = rect.collidepoint(mouse)
            color = (90, 110, 160) if hovered else (45, 55, 90)
            pygame.draw.rect(self.screen, color, rect, border_radius=12)
            pygame.draw.rect(self.screen, (220, 220, 230), rect, 2, border_radius=12)
            info = slots.get(str(slot_num))
            label = f"SAVE {slot_num} - "
            if info:
                label += f"Salas: {info.get('room', 'room1')} | Vida: {info.get('hp', 5)}/{info.get('max_hp', 5)} | Reliquias: {info.get('relics', 0)}/3"
            else:
                label += "Novo jogo"
            self.screen.blit(self.font.render(label, True, (245, 245, 245)), (rect.x + 20, rect.y + 22))

        tut_rect = pygame.Rect(180, 452, 286, 48)
        quit_rect = pygame.Rect(494, 452, 286, 48)
        pygame.draw.rect(self.screen, (90, 80, 50), tut_rect, border_radius=10)
        pygame.draw.rect(self.screen, (90, 50, 50), quit_rect, border_radius=10)
        self.screen.blit(self.font.render("Tutorial", True, (255, 255, 255)), (tut_rect.x + 100, tut_rect.y + 12))
        self.screen.blit(self.font.render("Sair", True, (255, 255, 255)), (quit_rect.x + 122, quit_rect.y + 12))

        hint = self.font.render("Clique esquerdo para carregar e direito para apagar. Use 1, 2, 3 ou T para o tutorial.", True, (240, 240, 240))
        self.screen.blit(hint, (WIDTH // 2 - hint.get_width() // 2, 414))
        if self.menu_message:
            msg = self.font.render(self.menu_message, True, (255, 220, 140))
            self.screen.blit(msg, (WIDTH // 2 - msg.get_width() // 2, 500))

    def draw_tutorial(self):
        self.screen.blit(self.menu_bg, (0, 0))
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((6, 10, 18, 210))
        self.screen.blit(overlay, (0, 0))
        title = self.huge_font.render("Como Jogar", True, (250, 230, 170))
        self.screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 24))

        lines = [
            "Mover: A/D ou setas esquerda/direita",
            "Saltar: ESPACO, Z, W ou seta para cima",
            "Ataque corpo a corpo: J ou X",
            "Ataque a distancia: K ou C",
            "Dash: Shift ou Ctrl, desbloqueado na sala 3",
            "Baixar-se rapidamente: S",
            "Objetivo: recolhe 3 reliquias, abre a porta do boss e derrota-o.",
            "Os inimigos reaparecem sempre que sais e voltas a entrar numa sala.",
            "O save e automatico ao trocar de sala ou apanhar itens.",
        ]
        y = 120
        for line in lines:
            text = self.font.render(line, True, (240, 240, 240))
            self.screen.blit(text, (120, y))
            y += 42
        footer = self.font.render("Pressiona ESC para voltar ao menu.", True, (255, 220, 140))
        self.screen.blit(footer, (WIDTH // 2 - footer.get_width() // 2, HEIGHT - 52))

    def draw_gameover(self):
        self.draw_room()
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 170))
        self.screen.blit(overlay, (0, 0))
        text = self.huge_font.render("Derrotado", True, (255, 120, 120))
        self.screen.blit(text, (WIDTH // 2 - text.get_width() // 2, 180))
        hint = self.font.render("Pressiona ENTER para voltar ao menu.", True, (255, 255, 255))
        self.screen.blit(hint, (WIDTH // 2 - hint.get_width() // 2, 270))

    def draw_victory(self):
        self.draw_room()
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 140))
        self.screen.blit(overlay, (0, 0))
        text = self.huge_font.render("Vitoria", True, (255, 235, 160))
        self.screen.blit(text, (WIDTH // 2 - text.get_width() // 2, 160))
        lines = [
            "O rei recuperou o seu nome e a sua coroa.",
            "Pressiona ENTER para voltar ao menu.",
        ]
        for i, line in enumerate(lines):
            t = self.font.render(line, True, (245, 245, 245))
            self.screen.blit(t, (WIDTH // 2 - t.get_width() // 2, 250 + i * 34))

    def handle_menu_click(self, pos, button=1):
        slots = [pygame.Rect(180, 170, 600, 66), pygame.Rect(180, 262, 600, 66), pygame.Rect(180, 354, 600, 66)]
        for idx, rect in enumerate(slots, start=1):
            if rect.collidepoint(pos):
                if button == 1:
                    self.load_slot(idx)
                elif button == 3:
                    delete_save(idx)
                    self.save_payload = load_all_saves()
                    if self.current_slot == idx and self.state == "play":
                        self.state = "menu"
                        self.menu_message = f"Save {idx} apagado."
                return
        if pygame.Rect(180, 452, 286, 48).collidepoint(pos):
            self.state = "tutorial"
        if pygame.Rect(494, 452, 286, 48).collidepoint(pos):
            pygame.quit()
            sys.exit()

    def run(self):
        while True:
            self.consume_frame_events = pygame.event.get()
            for event in self.consume_frame_events:
                if event.type == pygame.QUIT:
                    self.auto_save()
                    pygame.quit()
                    sys.exit()
                if event.type == pygame.KEYDOWN:
                    if self.state == "menu":
                        if event.key == pygame.K_t:
                            self.state = "tutorial"
                        elif event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                            self.load_slot(int(event.unicode))
                        elif event.key == pygame.K_ESCAPE:
                            pygame.quit()
                            sys.exit()
                    elif self.state == "tutorial":
                        if event.key == pygame.K_ESCAPE:
                            self.state = "menu"
                    elif self.state == "gameover":
                        if event.key == pygame.K_RETURN:
                            self.state = "menu"
                    elif self.state == "victory":
                        if event.key == pygame.K_RETURN:
                            self.state = "menu"
                    elif self.state == "play":
                        if event.key in (pygame.K_SPACE, pygame.K_z, pygame.K_w, pygame.K_UP):
                            self.player.begin_jump()
                        elif event.key in (pygame.K_j, pygame.K_x):
                            self.player.begin_melee()
                        elif event.key in (pygame.K_k, pygame.K_c):
                            proj = self.player.begin_ranged()
                            if proj:
                                self.projectiles.append(proj)
                        elif event.key in (pygame.K_LSHIFT, pygame.K_RSHIFT, pygame.K_LCTRL, pygame.K_RCTRL):
                            self.player.begin_dash()
                        elif event.key == pygame.K_ESCAPE:
                            self.state = "menu"
                            self.auto_save()
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if self.state == "menu":
                        self.handle_menu_click(event.pos, event.button)
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 3:
                    if self.state == "menu":
                        self.handle_menu_click(event.pos, event.button)

            if self.state == "menu":
                self.draw_menu()
            elif self.state == "tutorial":
                self.draw_tutorial()
            elif self.state == "play":
                self.update_play()
                self.draw_room()
            elif self.state == "gameover":
                self.draw_gameover()
            elif self.state == "victory":
                self.draw_victory()

            pygame.display.flip()
            self.clock.tick(FPS)


def main():
    Game().run()


if __name__ == "__main__":
    main()
