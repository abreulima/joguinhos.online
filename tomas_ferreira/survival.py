import pygame
import sys
import os
import random

# --- Configuração ---
LARGURA, ALTURA = 1280, 720
TAMANHO_TILE = 40
FPS = 60

# --- Cores ---
PRETO = (10, 10, 15)
BRANCO = (240, 240, 240)
CINZA = (40, 40, 50)
VERDE = (60, 180, 80)
VERMELHO = (200, 60, 60)
AMARELO = (240, 200, 40)
MARRON = (140, 90, 50)

# --- Assets ---
CAMINHO_ASSETS = os.path.join(os.path.dirname(__file__), "artes")


def carregar_img(nome, tamanho=None):
    caminho = os.path.join(CAMINHO_ASSETS, nome)
    if not os.path.exists(caminho):
        return None
    img = pygame.image.load(caminho).convert_alpha()
    if tamanho:
        img = pygame.transform.scale(img, tamanho)
    return img


def tile_para_mundo(col, lin):
    return (col * TAMANHO_TILE, lin * TAMANHO_TILE)


def mundo_para_tile(x, y):
    return (int(x // TAMANHO_TILE), int(y // TAMANHO_TILE))


class Jogador(pygame.sprite.Sprite):
    def __init__(self, x, y):
        super().__init__()
        img = carregar_img("jogador.png", (40, 48))
        self.image = img or pygame.Surface((32, 40))
        self.image.fill((200, 160, 90))
        self.rect = self.image.get_rect(topleft=(x, y))
        self.vel_x = 0
        self.vel_y = 0
        self.no_chao = False
        self.hp = 100
        self.fome = 100
        self.inventario = {
            "madeira": 0,
            "pedra": 0,
            "comida": 3,
            "ferramenta": 0,
        }
        self.selecionado = "comida"

    def atualizar(self, teclas, tiles):
        self.vel_x = 0
        velocidade = 4.5
        if teclas[pygame.K_a]:
            self.vel_x = -velocidade
        if teclas[pygame.K_d]:
            self.vel_x = velocidade
        if teclas[pygame.K_w]:
            self.vel_y = -velocidade
        if teclas[pygame.K_s]:
            self.vel_y = velocidade

        self.rect.x += self.vel_x
        hits = pygame.sprite.spritecollide(self, tiles, False)
        for bloco in hits:
            if self.vel_x > 0 and self.rect.right > bloco.rect.left:
                self.rect.right = bloco.rect.left
            elif self.vel_x < 0 and self.rect.left < bloco.rect.right:
                self.rect.left = bloco.rect.right

        self.rect.y += self.vel_y
        hits = pygame.sprite.spritecollide(self, tiles, False)
        self.no_chao = False
        for bloco in hits:
            if self.vel_y > 0 and self.rect.bottom <= bloco.rect.top + 10:
                self.rect.bottom = bloco.rect.top
                self.vel_y = 0
                self.no_chao = True
            elif self.vel_y < 0 and self.rect.top >= bloco.rect.bottom - 10:
                self.rect.top = bloco.rect.bottom
                self.vel_y = 0

        self.fome = max(0, self.fome - 0.025)
        if self.fome == 0:
            self.hp = max(0, self.hp - 0.03)


class Tile(pygame.sprite.Sprite):
    def __init__(self, x, y, cor, nome="tile"):
        super().__init__()
        self.image = pygame.Surface((TAMANHO_TILE, TAMANHO_TILE))
        self.image.fill(cor)
        self.nome = nome
        self.rect = self.image.get_rect(topleft=(x, y))


class Recurso(pygame.sprite.Sprite):
    def __init__(self, x, y, tipo):
        super().__init__()
        self.tipo = tipo
        if tipo == "arvore":
            img = carregar_img("coin.png", (36, 36))
            self.image = img or pygame.Surface((30, 34))
            self.image.fill((120, 200, 60))
            self.rect = self.image.get_rect(center=(x, y))
            self.coleta = "madeira"
            self.quantidade = random.randint(2, 5)
        elif tipo == "pedra":
            img = carregar_img("ARMA.png", (32, 32))
            self.image = img or pygame.Surface((28, 28))
            self.image.fill((140, 140, 150))
            self.rect = self.image.get_rect(center=(x, y))
            self.coleta = "pedra"
            self.quantidade = random.randint(1, 4)
        else:
            img = carregar_img("comida")
            self.image = img or pygame.Surface((24, 24))
            self.image.fill((240, 120, 40))
            self.rect = self.image.get_rect(center=(x, y))
            self.coleta = "comida"
            self.quantidade = 1


class Inimigo(pygame.sprite.Sprite):
    def __init__(self, x, y, alvo):
        super().__init__()
        img = carregar_img("inimigo.png", (40, 40))
        self.image = img or pygame.Surface((32, 32))
        self.image.fill(VERMELHO)
        self.rect = self.image.get_rect(topleft=(x, y))
        self.alvo = alvo
        self.velocidade = 1.2
        self.dano = 0.4

    def atualizar(self):
        alvo = self.alvo.rect
        if self.rect.x < alvo.x:
            self.rect.x += self.velocidade
        elif self.rect.x > alvo.x:
            self.rect.x -= self.velocidade
        if self.rect.y < alvo.y:
            self.rect.y += self.velocidade
        elif self.rect.y > alvo.y:
            self.rect.y -= self.velocidade


class MundoSobrevivencia:
    def __init__(self, largura_tiles, altura_tiles):
        self.largura_tiles = largura_tiles
        self.altura_tiles = altura_tiles
        self.tiles = pygame.sprite.Group()
        self.recursos = pygame.sprite.Group()
        self.gerar()

    def gerar(self):
        self.tiles.empty()
        self.recursos.empty()
        minimo = 3
        for lin in range(self.altura_tiles):
            for col in range(self.largura_tiles):
                x, y = tile_para_mundo(col, lin)
                if lin < minimo:
                    bloco = Tile(x, y, CINZA, "chao")
                else:
                    r = random.random()
                    if r < 0.2:
                        bloco = Tile(x, y, (70, 100, 50), "relva")
                    elif r < 0.35:
                        bloco = Tile(x, y, (90, 110, 60), "terra")
                    elif r < 0.45:
                        bloco = Tile(x, y, (130, 130, 150), "pedra")
                    else:
                        bloco = Tile(x, y, (60, 90, 40), "relva")
                self.tiles.add(bloco)

        for _ in range(140):
            tx = random.randint(0, self.largura_tiles - 1)
            ty = random.randint(minimo + 1, self.altura_tiles - 1)
            wx, wy = tile_para_mundo(tx, ty)
            tipo = random.choice(["arvore", "arvore", "pedra", "arbusto"])
            recurso = Recurso(wx + TAMANHO_TILE // 2, wy + TAMANHO_TILE // 2, tipo)
            self.recursos.add(recurso)

    def tile_em(self, x, y):
        tx, ty = mundo_para_tile(x, y)
        if tx < 0 or ty < 0 or tx >= self.largura_tiles or ty >= self.altura_tiles:
            return None
        for t in self.tiles:
            if t.rect.collidepoint(x, y):
                return t
        return None


class Jogo:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Sobrevivencia Primitiva")
        self.tela = pygame.display.set_mode((LARGURA, ALTURA))
        self.relogio = pygame.time.Clock()
        self.fonte = pygame.font.SysFont("consolas", 18)
        self.fonte_grande = pygame.font.SysFont("consolas", 26, bold=True)

        self.mundo = MundoSobrevivencia(
            LARGURA // TAMANHO_TILE + 2,
            ALTURA // TAMANHO_TILE + 2,
        )
        self.jogador = Jogador(100, 100)
        self.inimigos = pygame.sprite.Group()
        for _ in range(18):
            ex = random.randint(0, LARGURA)
            ey = random.randint(0, ALTURA)
            self.inimigos.add(Inimigo(ex, ey, self.jogador))

        self.pausado = False
        self.mensagem = "Colete madeira e comida para sobreviver"
        self.temporizador_mensagem = 4.0

    def eventos(self):
        for evento in pygame.event.get():
            if evento.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if evento.type == pygame.KEYDOWN:
                if evento.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()
                if evento.key == pygame.K_e:
                    self._interagir()
                if evento.key == pygame.K_1:
                    self.jogador.selecionado = "comida"
                if evento.key == pygame.K_2:
                    self.jogador.selecionado = "madeira"
                if evento.key == pygame.K_3:
                    self.jogador.selecionado = "pedra"
                if evento.key == pygame.K_4:
                    self.jogador.selecionado = "ferramenta"

    def _interagir(self):
        px, py = self.jogador.rect.center
        hits = [r for r in self.mundo.recursos if r.rect.collidepoint(px, py)]
        if not hits and self.jogador.selecionado == "ferramenta":
            self.mensagem = "Nenhum recurso por perto"
            self.temporizador_mensagem = 2.0
            return
        for recurso in hits:
            if recurso.tipo == "arbusto" and self.jogador.selecionado == "ferramenta":
                self.jogador.inventario["comida"] += recurso.quantidade
                self.mensagem = f"Coletou {recurso.quantidade} comida"
                self.temporizador_mensagem = 2.0
                recurso.kill()
            elif recurso.tipo in ("arvore", "pedra") and self.jogador.inventario.get("ferramenta", 0) > 0:
                self.jogador.inventario[recurso.coleta] += recurso.quantidade
                self.mensagem = f"Coletou {recurso.quantidade} {recurso.coleta}"
                self.temporizador_mensagem = 2.0
                recurso.kill()
            elif recurso.tipo in ("arvore", "pedra"):
                self.mensagem = "Precisas de uma ferramenta para coletar isto"
                self.temporizador_mensagem = 2.5
                return

    def atualizar(self, dt):
        if self.pausado:
            return
        teclas = pygame.key.get_pressed()
        self.jogador.atualizar(teclas, self.mundo.tiles)
        self.inimigos.update()

        hits = pygame.sprite.spritecollide(self.jogador, self.mundo.recursos, True)
        for recurso in hits:
            self.jogador.inventario[recurso.coleta] += recurso.quantidade
            self.mensagem = f"Coletou {recurso.quantidade} {recurso.coleta}"
            self.temporizador_mensagem = 2.0

        hits = pygame.sprite.spritecollide(self.jogador, self.inimigos, False)
        if hits:
            self.jogador.hp = max(0, self.jogador.hp - 0.3)

        if self.jogador.hp <= 0 or self.jogador.rect.top > ALTURA + 100:
            self.jogador = Jogador(100, 100)
            self.mundo.gerar()
            self.inimigos.empty()
            for _ in range(18):
                ex = random.randint(0, LARGURA)
                ey = random.randint(0, ALTURA)
                self.inimigos.add(Inimigo(ex, ey, self.jogador))

        if self.jogador.fome <= 0:
            self.jogador.hp = max(0, self.jogador.hp - 0.15)

        if self.temporizador_mensagem > 0:
            self.temporizador_mensagem -= dt

    def desenhar_barra(self, x, y, valor, maximo, cor):
        largura = 160
        altura = 14
        pygame.draw.rect(self.tela, (20, 20, 20), (x, y, largura, altura))
        porcentagem = max(0, min(1, valor / maximo))
        pygame.draw.rect(self.tela, cor, (x + 2, y + 2, int((largura - 4) * porcentagem), altura - 4))

    def desenhar_inventario(self):
        itens = ["comida", "madeira", "pedra", "ferramenta"]
        x_inicial = 20
        y = ALTURA - 70
        for idx, item in enumerate(itens):
            x = x_inicial + idx * 90
            pygame.draw.rect(self.tela, (20, 20, 20), (x, y, 70, 50))
            pygame.draw.rect(self.tela, (255, 255, 255) if item == self.jogador.selecionado else (70, 70, 70), (x, y, 70, 50), 2)
            txt = self.fonte.render(str(self.jogador.inventario.get(item, 0)), True, BRANCO)
            self.tela.blit(txt, (x + 8, y + 16))
            lbl = self.fonte.render(item[:5], True, BRANCO)
            self.tela.blit(lbl, (x + 8, y + 34))

    def desenhar(self):
        self.tela.fill(PRETO)
        self.mundo.tiles.draw(self.tela)
        self.mundo.recursos.draw(self.tela)
        self.inimigos.draw(self.tela)
        self.tela.blit(self.jogador.image, self.jogador.rect)

        self.desenhar_barra(20, 20, self.jogador.hp, 100, VERMELHO)
        self.desenhar_barra(200, 20, self.jogador.fome, 100, AMARELO)
        self.tela.blit(self.fonte.render(f"HP: {int(self.jogador.hp)}", True, BRANCO), (20, 40))
        self.tela.blit(self.fonte.render(f"Fome: {int(self.jogador.fome)}", True, BRANCO), (200, 40))
        self.tela.blit(self.fonte.render(self.mensagem, True, BRANCO), (20, 80))
        self.desenhar_inventario()
        self.tela.blit(self.fonte.render("WASD mover | E coletar | 1-4 inventario | ESC sair", True, BRANCO), (20, ALTURA - 20))
        pygame.display.flip()

    def loop(self):
        while True:
            dt = self.relogio.tick(FPS) / 1000.0
            self.eventos()
            self.atualizar(dt)
            self.desenhar()


def main():
    jogo = Jogo()
    jogo.loop()


if __name__ == "__main__":
    main()
