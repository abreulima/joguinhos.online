import random
import math
import os
import pygame
import sys

WIDTH, HEIGHT = 800, 600
FPS = 60
HIGH_SCORE_FILE = 'highscore.txt'
STARTING_PLAYER_HEALTH = 5

PLAYER_COLOR = (30, 144, 255)
ENEMY_COLOR = (139, 69, 19)
ITEM_COLOR = (34, 139, 34)
PROJECTILE_COLOR = (255, 215, 0)
SPECIAL_ITEM_COLOR = (70, 200, 255)
BOSS_COLOR = (170, 30, 30)

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT), pygame.FULLSCREEN)
clock = pygame.time.Clock()
font = pygame.font.SysFont(None, 24)
big_font = pygame.font.SysFont(None, 56)


def load_sprite(filename, size=None):
    path = os.path.join('artes', filename)
    image = pygame.image.load(path).convert_alpha()
    if size:
        image = pygame.transform.scale(image, size)
    return image


def center_blit(surf, image, x, y):
    rect = image.get_rect(center=(int(x), int(y)))
    surf.blit(image, rect)


def load_assets():
    assets = {}
    try:
        assets['background'] = load_sprite('fundo.png', (WIDTH, HEIGHT))
        assets['player'] = load_sprite('jogador.png', (40, 40))
        assets['player_left'] = load_sprite('jogador1.png', (40, 40))
        assets['player_walk_right'] = load_sprite('jogadorandar.png', (40, 40))
        assets['player_walk_left'] = load_sprite('jogadorandar1.png', (40, 40))
        assets['enemy'] = load_sprite('inimigo.png', (34, 34))
        assets['enemy2'] = load_sprite('inimigo2.png', (38, 38))
        assets['boss'] = load_sprite('boss.png', (72, 72))
        assets['item'] = load_sprite('coletavel.png', (24, 24))
        assets['special_item'] = load_sprite('especial.png', (28, 28))
        assets['projectile'] = load_sprite('arma.png', (20, 20))
        assets['special_projectile'] = load_sprite('especial.png', (20, 20))
        assets['life'] = load_sprite('vida.png', (20, 20))
        assets['objective'] = load_sprite('objetivo.png', (42, 42))
    except Exception:
        return {}
    return assets


ASSETS = load_assets()


def load_high_score():
    try:
        with open(HIGH_SCORE_FILE, 'r', encoding='utf-8') as file:
            return int(file.read().strip() or 0)
    except Exception:
        return 0


def save_high_score(score):
    try:
        with open(HIGH_SCORE_FILE, 'w', encoding='utf-8') as file:
            file.write(str(score))
    except Exception:
        pass


class Player:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.speed = 4
        self.radius = 16
        self.health = STARTING_PLAYER_HEALTH
        self.item = None
        self.last_throw_time = -3000
        self.invincible_until = 0
        self.throw_cooldown_bonus = 0
        self.has_boss_weapon = False
        self.facing = 'right'
        self.walking_sideways = False

    def rect(self):
        return pygame.Rect(self.x - self.radius, self.y - self.radius, self.radius * 2, self.radius * 2)

    def throw_cooldown(self):
        if not self.item:
            return 0
        return max(100, self.item.throw_cooldown - self.throw_cooldown_bonus)

    def update(self, keys):
        dx = dy = 0
        self.walking_sideways = False
        if keys[pygame.K_a] or keys[pygame.K_LEFT]:
            dx -= 1
            if keys[pygame.K_a]:
                self.facing = 'left'
                self.walking_sideways = True
        if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
            dx += 1
            if keys[pygame.K_d]:
                self.facing = 'right'
                self.walking_sideways = True
        if keys[pygame.K_w] or keys[pygame.K_UP]:
            dy -= 1
        if keys[pygame.K_s] or keys[pygame.K_DOWN]:
            dy += 1
        if dx or dy:
            length = math.hypot(dx, dy)
            self.x += self.speed * dx / length
            self.y += self.speed * dy / length
        self.x = max(self.radius, min(WIDTH - self.radius, self.x))
        self.y = max(self.radius, min(HEIGHT - self.radius, self.y))

    def draw(self, surf):
        now = pygame.time.get_ticks()
        if now < self.invincible_until and (now // 120) % 2 == 0:
            return
        sprite = self.current_sprite(now)
        if sprite:
            center_blit(surf, sprite, self.x, self.y)
        else:
            pygame.draw.circle(surf, PLAYER_COLOR, (int(self.x), int(self.y)), self.radius)
        if self.item:
            if self.item.special:
                now = pygame.time.get_ticks()
                remaining = max(0, (self.throw_cooldown() - (now - self.last_throw_time)) / 1000)
                txt = font.render(f'{self.item.name} ({remaining:.1f}s)', True, (255, 255, 255))
            else:
                txt = font.render(self.item.name, True, (255, 255, 255))
            surf.blit(txt, (10, HEIGHT - 30))

    def current_sprite(self, now):
        if self.facing == 'left':
            if self.walking_sideways and (now // 300) % 2 == 1:
                return ASSETS.get('player_walk_left')
            return ASSETS.get('player_left') or ASSETS.get('player')
        if self.walking_sideways and (now // 300) % 2 == 1:
            return ASSETS.get('player_walk_right')
        return ASSETS.get('player')


class Enemy:
    def __init__(self, x, y, is_boss=False, is_enemy2=False):
        self.x = x
        self.y = y
        self.is_boss = is_boss
        self.is_enemy2 = is_enemy2
        self.radius = 24 if is_boss else 14
        if is_boss:
            self.speed = random.uniform(1.95, 2.55)
        else:
            self.speed = random.uniform(1.0, 2.0)
            if is_enemy2:
                self.speed *= 0.75
        self.health = 10 if is_boss else 5 if is_enemy2 else 3
        self.color = BOSS_COLOR if is_boss else ENEMY_COLOR
        self.last_hit_time = -500

    def take_damage(self, amount, now):
        if now - self.last_hit_time < 500:
            return None
        self.last_hit_time = now
        self.health -= amount
        return self.health <= 0

    def update(self, player):
        dx = player.x - self.x
        dy = player.y - self.y
        dist = math.hypot(dx, dy)
        if dist > 0:
            self.x += self.speed * dx / dist
            self.y += self.speed * dy / dist

    def draw(self, surf):
        if self.is_boss:
            sprite = ASSETS.get('boss')
        elif self.is_enemy2:
            sprite = ASSETS.get('enemy2')
        else:
            sprite = ASSETS.get('enemy')
        if sprite:
            center_blit(surf, sprite, self.x, self.y)
        else:
            pygame.draw.circle(surf, self.color, (int(self.x), int(self.y)), self.radius)


class Item:
    def __init__(self, x, y, name, special=False, throw_cooldown=0):
        self.x = x
        self.y = y
        self.radius = 10 if special else 8
        self.name = name
        self.special = special
        self.throw_cooldown = throw_cooldown

    def draw(self, surf):
        sprite = ASSETS.get('special_item') if self.special else ASSETS.get('item')
        if sprite:
            center_blit(surf, sprite, self.x, self.y)
        else:
            color = SPECIAL_ITEM_COLOR if self.special else ITEM_COLOR
            pygame.draw.circle(surf, color, (self.x, self.y), self.radius)


class LifePickup:
    def __init__(self, x, y, created_at):
        self.x = x
        self.y = y
        self.radius = 10
        self.created_at = created_at
        self.expires_at = created_at + 10000

    def draw(self, surf):
        sprite = ASSETS.get('life')
        if sprite:
            center_blit(surf, sprite, self.x, self.y)
        else:
            pygame.draw.circle(surf, (220, 40, 70), (int(self.x), int(self.y)), self.radius)


class UpgradePickup:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.radius = 12

    def draw(self, surf):
        pygame.draw.circle(surf, (255, 215, 0), (int(self.x), int(self.y)), self.radius)
        label = font.render('+', True, (255, 255, 255))
        surf.blit(label, (int(self.x) - label.get_width() // 2, int(self.y) - label.get_height() // 2))


class Projectile:
    def __init__(self, x, y, tx, ty, damage, special=False):
        self.x = x
        self.y = y
        self.speed = 8
        self.damage = damage
        self.special = special
        self.hit_enemies = set()
        dx = tx - x
        dy = ty - y
        dist = math.hypot(dx, dy) or 1
        self.vx = self.speed * dx / dist
        self.vy = self.speed * dy / dist
        self.radius = 5

    def update(self):
        self.x += self.vx
        self.y += self.vy

    def draw(self, surf):
        sprite = ASSETS.get('special_projectile' if self.special else 'projectile')
        if sprite:
            center_blit(surf, sprite, self.x, self.y)
        else:
            pygame.draw.circle(surf, PROJECTILE_COLOR, (int(self.x), int(self.y)), self.radius)


def throw_item(player, projectiles, tx, ty, now):
    if not player.item:
        return
    if player.item.special:
        if now - player.last_throw_time < player.throw_cooldown():
            return
        dmg = 1
        player.last_throw_time = now
    else:
        dmg = 1
    projectiles.append(Projectile(player.x, player.y, tx, ty, dmg, special=player.item.special))
    if not player.item.special:
        player.item = None


def pickup_nearby_item(player, items):
    if player.item:
        return

    pickup_range = player.radius + 24
    nearby = [
        it for it in items
        if math.hypot(player.x - it.x, player.y - it.y) < pickup_range + it.radius
    ]
    if not nearby:
        return

    item = min(nearby, key=lambda it: math.hypot(player.x - it.x, player.y - it.y))
    player.item = item
    if item.special:
        player.has_boss_weapon = True
    items.remove(item)


def spawn_enemy():
    is_enemy2 = random.random() < 0.05
    side = random.choice(['top', 'bottom', 'left', 'right'])
    if side == 'top':
        return Enemy(random.randint(0, WIDTH), -20, is_enemy2=is_enemy2)
    if side == 'bottom':
        return Enemy(random.randint(0, WIDTH), HEIGHT + 20, is_enemy2=is_enemy2)
    if side == 'left':
        return Enemy(-20, random.randint(0, HEIGHT), is_enemy2=is_enemy2)
    return Enemy(WIDTH + 20, random.randint(0, HEIGHT), is_enemy2=is_enemy2)


def spawn_boss():
    side = random.choice(['top', 'bottom', 'left', 'right'])
    if side == 'top':
        return Enemy(random.randint(0, WIDTH), -30, is_boss=True)
    if side == 'bottom':
        return Enemy(random.randint(0, WIDTH), HEIGHT + 30, is_boss=True)
    if side == 'left':
        return Enemy(-30, random.randint(0, HEIGHT), is_boss=True)
    return Enemy(WIDTH + 30, random.randint(0, HEIGHT), is_boss=True)


def next_enemy_spawn_delay(player):
    if player.has_boss_weapon:
        return random.randint(500, 1000)
    return random.randint(1000, 2000)


def has_boss(enemies):
    return any(enemy.is_boss for enemy in enemies)


def random_item():
    names = ['Prego', 'Borracha', 'Líquido', 'Martelo', 'Tesoura']
    return random.choice(names)


def maybe_spawn_upgrade_after_first_boss(bosses_defeated, upgrade_pickups, x, y):
    if bosses_defeated < 1:
        return False
    if random.random() < 0.1:
        upgrade_pickups.append(UpgradePickup(x, y))
    return True


def draw_ui(surf, player, enemies, coco_kills=0, high_score=0):
    life_icon = ASSETS.get('life')
    if life_icon:
        center_blit(surf, life_icon, 20, 20)
        hp = font.render(f'x {player.health}', True, (255, 255, 255))
        surf.blit(hp, (34, 10))
    else:
        hp = font.render(f'Vida: {player.health}', True, (255, 255, 255))
        surf.blit(hp, (10, 10))
    count = font.render(f'Mortos: {coco_kills}', True, (255, 255, 255))
    surf.blit(count, (10, 30))
    record = font.render(f'High score: {high_score}', True, (255, 255, 255))
    surf.blit(record, (WIDTH - record.get_width() - 10, 10))
    if player.item:
        if player.item.special:
            now = pygame.time.get_ticks()
            remaining = max(0, (player.throw_cooldown() - (now - player.last_throw_time)) / 1000)
            hint = f'E/clique: atirar ({remaining:.1f}s)'
        else:
            hint = 'E/clique: atirar'
    else:
        hint = 'E: apanhar item'
    action = font.render(hint, True, (255, 255, 255))
    surf.blit(action, (10, 50))


def draw_victory(surf, coco_kills):
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 180))
    surf.blit(overlay, (0, 0))

    objective = ASSETS.get('objective')
    if objective:
        center_blit(surf, objective, WIDTH // 2, HEIGHT // 2 - 74)

    title = font.render('Vitória! 50 cocós derrotados.', True, (255, 255, 255))
    subtitle = font.render('Modo infinito desbloqueado.', True, (255, 255, 255))
    counter = font.render(f'Cocós abatidos: {coco_kills}', True, (255, 255, 255))

    surf.blit(title, (WIDTH // 2 - title.get_width() // 2, HEIGHT // 2 - 20))
    surf.blit(subtitle, (WIDTH // 2 - subtitle.get_width() // 2, HEIGHT // 2 + 8))
    surf.blit(counter, (WIDTH // 2 - counter.get_width() // 2, HEIGHT // 2 + 36))


def draw_button(surf, rect, text, mouse_pos):
    hovered = rect.collidepoint(mouse_pos)
    color = (70, 130, 180) if hovered else (45, 90, 130)
    pygame.draw.rect(surf, color, rect, border_radius=8)
    pygame.draw.rect(surf, (255, 255, 255), rect, 2, border_radius=8)
    label = font.render(text, True, (255, 255, 255))
    surf.blit(label, (rect.centerx - label.get_width() // 2, rect.centery - label.get_height() // 2))


def draw_menu_background(surf):
    background = ASSETS.get('background')
    if background:
        surf.blit(background, (0, 0))
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 150))
        surf.blit(overlay, (0, 0))
    else:
        surf.fill((18, 22, 26))


def show_tutorial():
    back_button = pygame.Rect(WIDTH // 2 - 90, HEIGHT - 95, 180, 48)
    lines = [
        'Comandos',
        'WASD ou setas: mover',
        'E perto de um item: apanhar',
        'E ou clique esquerdo com item: atirar',
        'A arma segue a direcao do ponteiro do rato',
        'Os cocos aguentam 3 hits e o boss aguenta 10 hits',
        'Alguns cocos raros sao mais lentos e aguentam 5 hits',
        'Ao apanhar upgrade, escolhes entre vida, velocidade ou cooldown',
        'A cada 10 cocos mortos pode aparecer uma vida por 10 segundos',
        'A cada 50 cocos mortos aparece um boss, se nao houver outro',
        'Quando perderes, carrega em R para reiniciar',
        'Derrota 50 cocos para desbloquear o modo infinito',
    ]

    while True:
        clock.tick(FPS)
        mouse_pos = pygame.mouse.get_pos()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN and event.key in (pygame.K_ESCAPE, pygame.K_RETURN):
                return
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if back_button.collidepoint(event.pos):
                    return

        draw_menu_background(screen)
        title = big_font.render(lines[0], True, (255, 255, 255))
        screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 80))
        for i, line in enumerate(lines[1:]):
            text = font.render(line, True, (235, 235, 235))
            screen.blit(text, (WIDTH // 2 - text.get_width() // 2, 170 + i * 34))
        draw_button(screen, back_button, 'Voltar', mouse_pos)
        pygame.display.flip()


def show_main_menu():
    play_button = pygame.Rect(WIDTH // 2 - 110, 265, 220, 56)
    tutorial_button = pygame.Rect(WIDTH // 2 - 110, 340, 220, 56)

    while True:
        clock.tick(FPS)
        mouse_pos = pygame.mouse.get_pos()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_RETURN:
                    return
                if event.key == pygame.K_t:
                    show_tutorial()
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if play_button.collidepoint(event.pos):
                    return
                if tutorial_button.collidepoint(event.pos):
                    show_tutorial()

        draw_menu_background(screen)
        title = big_font.render('Cocos em Fuga', True, (255, 255, 255))
        subtitle = font.render('Escolhe uma opcao', True, (235, 235, 235))
        screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 130))
        screen.blit(subtitle, (WIDTH // 2 - subtitle.get_width() // 2, 195))
        draw_button(screen, play_button, 'Jogar', mouse_pos)
        draw_button(screen, tutorial_button, 'Tutorial', mouse_pos)
        pygame.display.flip()


def apply_upgrade_choice(player, choice):
    if choice == 'life':
        player.health += 2
    elif choice == 'speed':
        player.speed *= 1.1
    elif choice == 'cooldown':
        player.throw_cooldown_bonus += 100


def show_upgrade_menu(player):
    options = [
        ('life', '+2 vidas'),
        ('speed', '+10% velocidade'),
        ('cooldown', '-0.1s cooldown'),
    ]
    buttons = []
    for i, (_, text) in enumerate(options):
        rect = pygame.Rect(WIDTH // 2 - 130, 245 + i * 70, 260, 52)
        buttons.append((rect, text))

    while True:
        clock.tick(FPS)
        mouse_pos = pygame.mouse.get_pos()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_1, pygame.K_KP1):
                    apply_upgrade_choice(player, 'life')
                    return
                if event.key in (pygame.K_2, pygame.K_KP2):
                    apply_upgrade_choice(player, 'speed')
                    return
                if event.key in (pygame.K_3, pygame.K_KP3):
                    apply_upgrade_choice(player, 'cooldown')
                    return
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                for i, (rect, _) in enumerate(buttons):
                    if rect.collidepoint(event.pos):
                        apply_upgrade_choice(player, options[i][0])
                        return

        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 210))
        screen.blit(overlay, (0, 0))
        title = big_font.render('Escolhe upgrade', True, (255, 255, 255))
        screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 150))
        for rect, text in buttons:
            draw_button(screen, rect, text, mouse_pos)
        pygame.display.flip()


def main(show_menu=True):
    if show_menu:
        show_main_menu()
    player = Player(WIDTH // 2, HEIGHT // 2)
    enemies = [spawn_enemy() for _ in range(5)]
    items = []
    life_pickups = []
    upgrade_pickups = []
    projectiles = []
    spawn_timer = 0
    next_spawn_delay = next_enemy_spawn_delay(player)
    item_timer = 0
    coco_kills = 0
    high_score = load_high_score()
    bosses_defeated = 0
    victory_overlay_until = 0
    infinite_mode = False
    victory_triggered = False

    while True:
        dt = clock.tick(FPS)
        now = pygame.time.get_ticks()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if victory_overlay_until and now < victory_overlay_until:
                continue
            if event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1 and player.item:
                    mx, my = pygame.mouse.get_pos()
                    throw_item(player, projectiles, mx, my, now)
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_e:
                    mx, my = pygame.mouse.get_pos()
                    if player.item:
                        throw_item(player, projectiles, mx, my, now)
                    else:
                        pickup_nearby_item(player, items)

        if victory_overlay_until:
            if now < victory_overlay_until:
                background = ASSETS.get('background')
                if background:
                    screen.blit(background, (0, 0))
                else:
                    screen.fill((20, 20, 20))
                for it in items:
                    it.draw(screen)
                for life in life_pickups:
                    life.draw(screen)
                for upgrade in upgrade_pickups:
                    upgrade.draw(screen)
                for e in enemies:
                    e.draw(screen)
                for p in projectiles:
                    p.draw(screen)
                player.draw(screen)
                draw_ui(screen, player, enemies, coco_kills, high_score)
                draw_victory(screen, coco_kills)
                pygame.display.flip()
                continue
            victory_overlay_until = 0
            infinite_mode = True

        keys = pygame.key.get_pressed()
        player.update(keys)

        for e in enemies:
            e.update(player)

        for p in projectiles:
            p.update()

        # Collisions: projectile vs enemy
        for p in projectiles[:]:
            for e in enemies[:]:
                if id(e) in p.hit_enemies:
                    continue
                if math.hypot(p.x - e.x, p.y - e.y) < p.radius + e.radius:
                    dead = e.take_damage(p.damage, now)
                    if dead is None:
                        continue
                    p.hit_enemies.add(id(e))
                    if dead:
                        if e.is_boss:
                            bosses_defeated += 1
                            if bosses_defeated == 1:
                                items.append(Item(e.x, e.y, 'Item do Boss', special=True, throw_cooldown=1500))
                            else:
                                maybe_spawn_upgrade_after_first_boss(bosses_defeated, upgrade_pickups, e.x, e.y)
                        if not e.is_boss:
                            coco_kills += 1
                            if coco_kills > high_score:
                                high_score = coco_kills
                                save_high_score(high_score)
                            if coco_kills % 10 == 0:
                                if not maybe_spawn_upgrade_after_first_boss(bosses_defeated, upgrade_pickups, e.x, e.y):
                                    if random.random() < 0.5:
                                        life_pickups.append(LifePickup(e.x, e.y, now))
                            if coco_kills % 50 == 0 and not has_boss(enemies):
                                enemies.append(spawn_boss())
                        try:
                            enemies.remove(e)
                        except ValueError:
                            pass

        life_pickups = [life for life in life_pickups if now < life.expires_at]
        for life in life_pickups[:]:
            if math.hypot(player.x - life.x, player.y - life.y) < player.radius + life.radius:
                player.health += 1
                life_pickups.remove(life)
        for upgrade in upgrade_pickups[:]:
            if math.hypot(player.x - upgrade.x, player.y - upgrade.y) < player.radius + upgrade.radius:
                upgrade_pickups.remove(upgrade)
                show_upgrade_menu(player)

        # Enemy hits player
        if now >= player.invincible_until:
            for e in enemies[:]:
                if math.hypot(player.x - e.x, player.y - e.y) < player.radius + e.radius:
                    player.health -= 1
                    player.invincible_until = now + 2000
                    if player.health <= 0:
                        return game_over(screen)
                    break

        # Spawn logic
        spawn_timer += dt
        if spawn_timer > next_spawn_delay:
            enemies.append(spawn_enemy())
            spawn_timer = 0
            next_spawn_delay = next_enemy_spawn_delay(player)

        item_timer += dt
        if item_timer > 4000:
            x = random.randint(20, WIDTH - 20)
            y = random.randint(40, HEIGHT - 20)
            if not maybe_spawn_upgrade_after_first_boss(bosses_defeated, upgrade_pickups, x, y):
                items.append(Item(x, y, random_item()))
            item_timer = 0

        # Remove off-screen projectiles
        projectiles = [p for p in projectiles if 0 <= p.x <= WIDTH and 0 <= p.y <= HEIGHT]

        background = ASSETS.get('background')
        if background:
            screen.blit(background, (0, 0))
        else:
            screen.fill((20, 20, 20))
        for it in items:
            it.draw(screen)
        for life in life_pickups:
            life.draw(screen)
        for upgrade in upgrade_pickups:
            upgrade.draw(screen)
        for e in enemies:
            e.draw(screen)
        for p in projectiles:
            p.draw(screen)
        player.draw(screen)
        draw_ui(screen, player, enemies, coco_kills, high_score)

        if coco_kills >= 50 and not victory_triggered:
            victory_triggered = True
            victory_overlay_until = now + 3000

        if infinite_mode:
            mode_text = font.render('Modo infinito ativo', True, (255, 255, 255))
            screen.blit(mode_text, (WIDTH - mode_text.get_width() - 10, 34))

        pygame.display.flip()


def game_over(surf):
    txt = font.render('Perdeste! Os cocós triunfam...', True, (255, 255, 255))
    surf.blit(txt, (WIDTH // 2 - txt.get_width() // 2, HEIGHT // 2))
    pygame.display.flip()
    pygame.time.wait(3000)
    pygame.quit()
    sys.exit()


def game_over(surf):
    while True:
        clock.tick(FPS)
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_r:
                    return True
                if event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()

        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 190))
        surf.blit(overlay, (0, 0))

        txt = font.render('Perdeste! Os cocos triunfam...', True, (255, 255, 255))
        restart = font.render('Carrega em R para reiniciar', True, (255, 255, 255))
        quit_hint = font.render('ESC para sair', True, (220, 220, 220))
        surf.blit(txt, (WIDTH // 2 - txt.get_width() // 2, HEIGHT // 2 - 28))
        surf.blit(restart, (WIDTH // 2 - restart.get_width() // 2, HEIGHT // 2 + 4))
        surf.blit(quit_hint, (WIDTH // 2 - quit_hint.get_width() // 2, HEIGHT // 2 + 34))
        pygame.display.flip()


if __name__ == '__main__':
    show_menu = True
    while main(show_menu):
        show_menu = False
