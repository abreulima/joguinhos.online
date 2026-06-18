import math
import random
import sys
import pygame

LARGURA_TELA = 1280
ALTURA_TELA = 720
FOV = math.radians(75)
RENDER_DISTANCE = 34
GRAVIDADE = 18.0
ALTURA_JOGADOR = 1.8
LARGURA_JOGADOR = 0.32
OLHOS = 1.62
SLOT_SIZE = 46
HOTBAR_SLOTS = 9
INVENTARIO_SLOTS = 32
CRAFT_SLOTS = 9
MAX_STACK = 64

BLOCKS = [
    {"nome": "Grama", "topo": (60, 175, 60), "pedra": (124, 124, 124), "lado": (110, 75, 38)},
    {"nome": "Terra", "topo": (130, 82, 42), "pedra": (124, 124, 124), "lado": (130, 82, 42)},
    {"nome": "Pedra", "topo": (130, 130, 130), "pedra": (100, 100, 110), "lado": (100, 100, 110)},
    {"nome": "Madeira", "topo": (140, 90, 45), "pedra": (100, 60, 30), "lado": (100, 60, 30)},
    {"nome": "Folhas", "topo": (40, 130, 50), "pedra": (30, 100, 40), "lado": (30, 100, 40)},
    {"nome": "Tijolo", "topo": (200, 90, 60), "pedra": (180, 80, 50), "lado": (180, 80, 50)},
    {"nome": "Tabua", "topo": (170, 130, 80), "pedra": (150, 110, 60), "lado": (150, 110, 60)},
    {"nome": "Forno", "topo": (90, 90, 90), "pedra": (70, 70, 70), "lado": (70, 70, 70)},
]

RECEITAS = [
    {"resultado": 5, "quantidade": 4, "ingredientes": {1: 2, 0: 1}, "forma": [(0,0),(1,0)], "nome": "Tijolo"},
    {"resultado": 6, "quantidade": 4, "ingredientes": {3: 1}, "forma": [(1,1)], "nome": "Tabuas"},
    {"resultado": 2, "quantidade": 1, "ingredientes": {1: 2, 2: 1}, "forma": [(0,0),(1,0)], "nome": "Pedra"},
]

FACE_NORMALS = [
    (1, 0, 0), (-1, 0, 0),
    (0, 1, 0), (0, -1, 0),
    (0, 0, 1), (0, 0, -1),
]
FACE_NORMAL_SET = set(FACE_NORMALS)

SHADING = {
    (0, 1, 0): 1.15,
    (0, -1, 0): 0.55,
    (1, 0, 0): 0.70,
    (-1, 0, 0): 0.62,
    (0, 0, 1): 0.85,
    (0, 0, -1): 0.76,
}

def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v

def normalize(v):
    x, y, z = v
    inv = (x*x + y*y + z*z)
    if inv == 0:
        return (0.0, 0.0, 0.0)
    inv = 1.0 / math.sqrt(inv)
    return (x * inv, y * inv, z * inv)

def dot(a, b):
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]

def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])

def sub(a, b):
    return (a[0]-b[0], a[1]-b[1], a[2]-b[2])

def shade_color(cor, normal):
    fator = SHADING.get(normal, 0.76)
    return (clamp(int(cor[0]*fator),0,255), clamp(int(cor[1]*fator),0,255), clamp(int(cor[2]*fator),0,255))

def block_face(block, normal):
    x, y, z = block
    if normal == (1, 0, 0): return ((x+1,y,z),(x+1,y+1,z),(x+1,y+1,z+1),(x+1,y,z+1))
    if normal == (-1, 0, 0): return ((x,y,z+1),(x,y+1,z+1),(x,y+1,z),(x,y,z))
    if normal == (0, 1, 0): return ((x,y+1,z),(x,y+1,z+1),(x+1,y+1,z+1),(x+1,y+1,z))
    if normal == (0, -1, 0): return ((x,y,z+1),(x+1,y,z+1),(x+1,y,z),(x,y,z))
    if normal == (0, 0, 1): return ((x+1,y,z+1),(x,y,z+1),(x,y+1,z+1),(x+1,y+1,z+1))
    return ((x,y,z),(x+1,y,z),(x+1,y+1,z),(x,y+1,z))

def terreno_altura(x, z):
    return int(clamp(round(1 + 1.1*math.sin(x*0.30) + 0.9*math.cos(z*0.28) + 0.45*math.sin((x+z)*0.18)), 0, 4))

def gerar_mundo():
    m = {}
    for x in range(-26, 27):
        for z in range(-26, 27):
            h = terreno_altura(x, z)
            for y in range(-3, h+1):
                m[(x,y,z)] = 0 if y == h else 1 if y >= h-2 else 2
    for x in range(-20, 21):
        for z in range(-20, 21):
            if abs(x) < 3 and abs(z) < 3: continue
            if (x*7 + z*5 + x*z) % 19 != 0: continue
            h = terreno_altura(x, z)
            for y in range(h+1, h+5): m[(x,y,z)] = 3
            for dx in range(-2, 3):
                for dz in range(-2, 3):
                    for dy in range(h+3, h+7):
                        if abs(dx)+abs(dz)+abs(dy-(h+5)) > 4: continue
                        if (x+dx, dy, z+dz) not in m:
                            m[(x+dx, dy, z+dz)] = 4
    return m

def criar_slot(tipo=None, qtd=0):
    return {"tipo": tipo, "qtd": max(0, qtd)}

def eh_vazio(s):
    return not s or s["qtd"] <= 0

def clonar(s):
    if not s or s["qtd"] <= 0: return criar_slot()
    return criar_slot(s["tipo"], s["qtd"])

class Jogo:
    def __init__(self):
        pygame.init()
        self.tela = pygame.display.set_mode((LARGURA_TELA, ALTURA_TELA), pygame.FULLSCREEN | pygame.RESIZABLE)
        self.relogio = pygame.time.Clock()
        self.fonte = pygame.font.SysFont("consolas", 18)
        self.fonte_peq = pygame.font.SysFont("consolas", 14)
        
        self.mundo = gerar_mundo()
        self.faces_cache = {}
        self.cache_cores = {}
        self._reconstruir_faces_inicial()
        
        self.hotbar = [criar_slot(tipo=i, qtd=MAX_STACK if i < len(BLOCKS) else 0) for i in range(HOTBAR_SLOTS)]
        self.inventario = [criar_slot() for _ in range(INVENTARIO_SLOTS)]
        self.craft_grid = [criar_slot() for _ in range(CRAFT_SLOTS)]
        self.craft_resultado = criar_slot()
        
        self.mouse_capturado = True
        self.mostrar_inv = False
        self.on_ground = False
        self.vel_y = 0.0
        self.yaw = 0.0
        self.pitch = 0.0
        self.pos = [0.5, float(terreno_altura(0,0)+2), 0.5]
        self.blocos_pisados = {}
        self.blocos_relva_mudada = set()
        self.ultimo_alvo = None
        self.superficie_render = None
        self.area_desenho = None
        self.redimensionar()
        self._init_ui()
        
        # Drag state
        self.arrastando = None  # (origem, index, qtd) or None
        
    def _reconstruir_faces_inicial(self):
        self.faces_cache = {}
        self.cache_cores.clear()
        for bloco in self.mundo:
            self.faces_cache[bloco] = self._faces_visiveis(bloco)
    
    def _faces_visiveis(self, bloco):
        return [n for n in FACE_NORMALS if (bloco[0]+n[0], bloco[1]+n[1], bloco[2]+n[2]) not in self.mundo]
    
    def _atualizar_faces_vizinhos(self, bloco):
        for dx, dy, dz in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
            viz = (bloco[0]+dx, bloco[1]+dy, bloco[2]+dz)
            if viz in self.mundo:
                self.faces_cache[viz] = self._faces_visiveis(viz)
            else:
                self.faces_cache.pop(viz, None)
    
    def _atualizar_faces_bloco(self, bloco):
        if bloco in self.mundo:
            self.faces_cache[bloco] = self._faces_visiveis(bloco)
        else:
            self.faces_cache.pop(bloco, None)
    
    def _on_block_changed(self, bloco):
        self._atualizar_faces_bloco(bloco)
        self._atualizar_faces_vizinhos(bloco)
    
    def _init_ui(self):
        w, h = self.tela.get_size()
        self.textos_ui = [
            self.fonte.render("Mini Minecraft 3D", True, (255,255,255)),
            self.fonte.render("WASD mover | Shift correr | Espaco pular", True, (220,220,220)),
            self.fonte.render("Clique esq quebrar | Clique dir colocar", True, (220,220,220)),
            self.fonte.render("1-9 hotbar | E inventario | Enter craftar", True, (220,220,220)),
        ]
        self.painel_ui = pygame.Surface((400, 100), pygame.SRCALPHA)
        self.painel_ui.fill((0,0,0,125))
        self.painel_inv = pygame.Surface((600, 380), pygame.SRCALPHA)
        self.painel_inv.fill((0,0,0,170))
        self.mira = pygame.Surface((24,24), pygame.SRCALPHA)
        pygame.draw.line(self.mira, (255,255,255), (2,12),(10,12),2)
        pygame.draw.line(self.mira, (255,255,255), (14,12),(22,12),2)
        pygame.draw.line(self.mira, (255,255,255), (12,2),(12,10),2)
        pygame.draw.line(self.mira, (255,255,255), (12,14),(12,22),2)
        self.sol = pygame.Surface((90,90), pygame.SRCALPHA)
        pygame.draw.circle(self.sol, (255,235,160), (45,45), 42)
        
    def redimensionar(self):
        w, h = self.tela.get_size()
        t = (max(1, int(w*0.60)), max(1, int(h*0.60)))
        if self.superficie_render is None or self.superficie_render.get_size() != t:
            self.superficie_render = pygame.Surface(t)
        self.area_desenho = self.superficie_render
    
    def reset_jogador(self):
        h = terreno_altura(0,0)
        self.pos = [0.5, float(h+2.0), 0.5]
        self.vel_y = 0.0
        self.on_ground = False
        self.blocos_pisados.clear()
        self.blocos_relva_mudada.clear()
    
    def _camera_basis(self):
        cp = self.pitch
        cy = self.yaw
        fwd = (math.cos(cp)*math.sin(cy), math.sin(cp), math.cos(cp)*math.cos(cy))
        fwd = normalize(fwd)
        rgt = (math.cos(cy), 0.0, -math.sin(cy))
        up = cross(fwd, rgt)
        return fwd, rgt, up
    
    def direction(self):
        cp = self.pitch
        cy = self.yaw
        return normalize((math.cos(cp)*math.sin(cy), math.sin(cp), math.cos(cp)*math.cos(cy)))
    
    def _player_aabb(self, pos=None):
        x, y, z = pos or self.pos
        return (x-LARGURA_JOGADOR, y, z-LARGURA_JOGADOR, x+LARGURA_JOGADOR, y+ALTURA_JOGADOR, z+LARGURA_JOGADOR)
    
    def _block_aabb(self, b):
        x, y, z = b
        return (x, y, z, x+1, y+1, z+1)
    
    def _intersects(self, aabb, block):
        ax1, ay1, az1, ax2, ay2, az2 = aabb
        bx1, by1, bz1, bx2, by2, bz2 = self._block_aabb(block)
        return ax1 < bx2 and ax2 > bx1 and ay1 < by2 and ay2 > by1 and az1 < bz2 and az2 > bz1
    
    def alvo_construcao(self):
        origem = (self.pos[0], self.pos[1]+OLHOS, self.pos[2])
        direcao = self.direction()
        hit = self._raycast(origem, direcao, 5.0)
        if not hit: return None
        bloco_alvo, normal = hit
        novo = (bloco_alvo[0]+normal[0], bloco_alvo[1]+normal[1], bloco_alvo[2]+normal[2])
        valido = novo not in self.mundo and not self._player_intersects_block(novo)
        return {"bloco": bloco_alvo, "normal": normal, "novo": novo, "valido": valido}
    
    def _player_intersects_block(self, block):
        return self._intersects(self._player_aabb(), block)
    
    def limpar_dados_bloco(self, bloco):
        self.blocos_relva_mudada.discard(bloco)
        self.blocos_pisados.pop(bloco, None)
    
    def _intersecting_blocks(self, aabb):
        x1 = int(aabb[0]); y1 = int(aabb[1]); z1 = int(aabb[2])
        x2 = int(aabb[3]); y2 = int(aabb[4]); z2 = int(aabb[5])
        res = []
        for x in range(x1, x2+1):
            for y in range(y1, y2+1):
                for z in range(z1, z2+1):
                    b = (x,y,z)
                    if b in self.mundo and self._intersects(aabb, b):
                        res.append(b)
        return res
    
    def _intersects_world(self, aabb):
        return len(self._intersecting_blocks(aabb)) > 0
    
    def _collide_axis(self, eixo, delta):
        if delta == 0: return
        self.pos[eixo] += delta
        aabb = self._player_aabb()
        blocos = self._intersecting_blocks(aabb)
        if not blocos: return
        if eixo == 0:
            if delta > 0: self.pos[0] = min(b[0]-LARGURA_JOGADOR for b in blocos)
            else: self.pos[0] = max(b[0]+1+LARGURA_JOGADOR for b in blocos)
        elif eixo == 1:
            if delta > 0: self.pos[1] = min(b[1]-ALTURA_JOGADOR for b in blocos)
            else: self.pos[1] = max(b[1]+1 for b in blocos); self.on_ground = True
        else:
            if delta > 0: self.pos[2] = min(b[2]-LARGURA_JOGADOR for b in blocos)
            else: self.pos[2] = max(b[2]+1+LARGURA_JOGADOR for b in blocos)
    
    def atualizar(self, dt, teclas):
        fwd, rgt, _ = self._camera_basis()
        spd = 5.2 * (1.75 if teclas[pygame.K_LSHIFT] or teclas[pygame.K_RSHIFT] else 1.0)
        mv = [0.0, 0.0, 0.0]
        if teclas[pygame.K_w]: mv = [mv[i]+fwd[i] for i in range(3)]
        if teclas[pygame.K_s]: mv = [mv[i]-fwd[i] for i in range(3)]
        if teclas[pygame.K_d]: mv = [mv[i]+rgt[i] for i in range(3)]
        if teclas[pygame.K_a]: mv = [mv[i]-rgt[i] for i in range(3)]
        if (teclas[pygame.K_SPACE] or teclas[pygame.K_UP]) and self.on_ground:
            self.vel_y = 7.2; self.on_ground = False
        horiz = normalize((mv[0], 0.0, mv[2]))
        if horiz != (0.0, 0.0, 0.0):
            self._collide_axis(0, horiz[0]*spd*dt)
            self._collide_axis(2, horiz[2]*spd*dt)
        self.vel_y -= 20.0*dt
        self.vel_y = max(self.vel_y, -18.0)
        self._collide_axis(1, self.vel_y*dt)
        tc = list(self._player_aabb())
        tc[1] -= 0.002; tc[4] -= 0.002
        self.on_ground = self._intersects_world(tuple(tc))
        self._atualizar_grass()
        if self.pos[1] < -30: self.reset_jogador()
    
    def _atualizar_grass(self):
        agora = pygame.time.get_ticks() / 1000.0
        if not self.on_ground:
            self.blocos_pisados.clear()
            return
        y = int(math.floor(self.pos[1]-0.001))
        aabb = self._player_aabb()
        x1=int(aabb[0]); x2=int(aabb[3]); z1=int(aabb[2]); z2=int(aabb[5])
        for x in range(x1, x2+1):
            for z in range(z1, z2+1):
                b = (x,y,z)
                if b in self.blocos_relva_mudada or self.mundo.get(b) != 0:
                    self.blocos_pisados.pop(b, None)
                else:
                    self.blocos_pisados.setdefault(b, agora)
        for b, t0 in list(self.blocos_pisados.items()):
            if agora - t0 >= 5.0:
                if self.mundo.get(b) == 0: self.blocos_relva_mudada.add(b)
                self.blocos_pisados.pop(b, None)
    
    def _raycast(self, origem, direcao, dist_max):
        x, y, z = origem
        bx, by, bz = int(math.floor(x)), int(math.floor(y)), int(math.floor(z))
        dx, dy, dz = direcao
        sx = 1 if dx >= 0 else -1
        sy = 1 if dy >= 0 else -1
        sz = 1 if dz >= 0 else -1
        if dx == 0: tmx=float('inf'); tdx=float('inf')
        else: tmx=((bx+(1 if sx>0 else 0))-x)/dx; tdx=abs(1/dx)
        if dy == 0: tmy=float('inf'); tdy=float('inf')
        else: tmy=((by+(1 if sy>0 else 0))-y)/dy; tdy=abs(1/dy)
        if dz == 0: tmz=float('inf'); tdz=float('inf')
        else: tmz=((bz+(1 if sz>0 else 0))-z)/dz; tdz=abs(1/dz)
        
        while True:
            if (bx,by,bz) in self.mundo:
                if bx==int(origem[0]) and by==int(origem[1]) and bz==int(origem[2]): pass
                else:
                    norm = self._face_normal_from_step(sx,sy,sz,tmx,tmy,tmz)
                    return (bx,by,bz), norm
            if tmx < tmy:
                if tmx < tmz: bx+=sx; tmx+=tdx
                else: bz+=sz; tmz+=tdz
            else:
                if tmy < tmz: by+=sy; tmy+=tdy
                else: bz+=sz; tmz+=tdz
            if min(tmx,tmy,tmz) > dist_max: return None
    
    def _face_normal_from_step(self, sx, sy, sz, tx, ty, tz):
        if tx < ty:
            return (-sx, 0, 0) if tx < tz else (0, 0, -sz)
        return (0, -sy, 0) if ty < tz else (0, 0, -sz)
    
    def _projetar(self, ponto, fwd, rgt, up, w, h):
        rel = sub(ponto, (self.pos[0], self.pos[1]+OLHOS, self.pos[2]))
        cz = dot(rel, fwd)
        if cz <= 0.05: return None
        esc = (h/2) / math.tan(FOV/2)
        return (int(w/2 + dot(rel,rgt)/cz*esc), int(h/2 - dot(rel,up)/cz*esc), cz)
    
    def _desenhar_mundo(self, w, h):
        self.area_desenho.fill((135, 206, 235))
        self.area_desenho.blit(self.sol, (w-155, 50))
        fwd, rgt, up = self._camera_basis()
        cam = (self.pos[0], self.pos[1]+OLHOS, self.pos[2])
        faces = []
        
        cx = int(self.pos[0]); cz = int(self.pos[2])
        rd = RENDER_DISTANCE
        x0 = cx - rd; x1 = cx + rd
        z0 = cz - rd; z1 = cz + rd
        y_limit = 12  # vertical slice limit from camera
        
        for (bx, by, bz), tipo in self.mundo.items():
            if not (x0 <= bx <= x1 and z0 <= bz <= z1): continue
            if abs(by - int(self.pos[1])) > y_limit: continue
            
            for normal in self.faces_cache.get((bx,by,bz), FACE_NORMALS):
                if dot(normal, sub(cam, (bx+0.5, by+0.5, bz+0.5))) <= 0: continue
                vs = block_face((bx,by,bz), normal)
                pd = min(dot(sub(v, cam), fwd) for v in vs)
                if 0.05 < pd < RENDER_DISTANCE+4:
                    faces.append((pd, tipo, normal, vs))
        
        faces.sort(key=lambda x: x[0], reverse=True)
        for _, tipo, normal, vs in faces:
            proj = [self._projetar(v, fwd, rgt, up, w, h) for v in vs]
            if any(p is None for p in proj): continue
            pts = tuple((p[0], p[1]) for p in proj)
            ch = (tipo, normal)
            if ch not in self.cache_cores:
                d = BLOCKS[tipo]
                cor = d["pedra"] if tipo == 2 else d["topo"] if normal == (0,1,0) else d["lado"]
                self.cache_cores[ch] = shade_color(cor, normal)
            cor = self.cache_cores[ch]
            pygame.draw.polygon(self.area_desenho, cor, pts)
            pygame.draw.polygon(self.area_desenho, (18,18,18), pts, 1)
    
    def _achar_slot(self, tipo, qtd=1):
        for s in self.inventario:
            if s["tipo"] == tipo and s["qtd"] < MAX_STACK:
                return s
        for s in self.inventario:
            if eh_vazio(s):
                s["tipo"] = tipo
                s["qtd"] = qtd
                return s
        return None
    
    def _consumir_slot(self, slot):
        slot["qtd"] -= 1
        if slot["qtd"] <= 0:
            slot["tipo"] = None
            slot["qtd"] = 0
    
    def _hotbar_ativo(self):
        for s in self.hotbar:
            if s["qtd"] > 0 and s["tipo"] is not None:
                return s["tipo"]
        return None
    
    def _desenhar_slot(self, x, y, slot, sel=False, tam=SLOT_SIZE):
        pygame.draw.rect(self.area_desenho, (20,20,20), (x,y,tam,tam))
        pygame.draw.rect(self.area_desenho, (255,255,255) if sel else (120,120,120), (x,y,tam,tam), 2 if sel else 1)
        t = slot.get("tipo")
        if t is not None and 0 <= t < len(BLOCKS):
            pygame.draw.rect(self.area_desenho, BLOCKS[t]["topo"], (x+4, y+4, tam-8, tam-8))
        if slot and slot["qtd"] > 0:
            q = self.fonte.render(str(slot["qtd"]), True, (255,255,255))
            self.area_desenho.blit(q, (x+tam-20, y+4))
    
    def _desenhar_hotbar(self, w, h):
        tam = 44
        gap = 4
        total = HOTBAR_SLOTS
        lw = total*(tam+gap)-gap
        x0 = w//2 - lw//2
        y0 = h - tam - 20
        pygame.draw.rect(self.area_desenho, (0,0,0,130), (x0-10, y0-5, lw+20, tam+15))
        for i in range(total):
            x = x0 + i*(tam+gap)
            s = self.hotbar[i]
            sel = (s.get("tipo") is not None and s["qtd"] > 0 and s == self._get_selected_hotbar())
            self._desenhar_slot(x, y0, s, sel, tam)
            pygame.draw.rect(self.area_desenho, (180,180,180), (x, y0, tam, tam), 1)
    
    def _get_selected_hotbar(self):
        for s in self.hotbar:
            if s["qtd"] > 0 and s["tipo"] is not None:
                return s
        return self.hotbar[0]
    
    def _desenhar_inventario(self, w, h):
        if not self.mostrar_inv: return
        Painel = self.painel_inv
        pw, ph = 600, 380
        px = w//2 - pw//2
        py = 30
        self.area_desenho.blit(Painel, (px, py))
        pygame.draw.rect(self.area_desenho, (255,255,255), (px,py,pw,ph), 2)
        
        titulo = self.fonte.render("INVENTARIO - E fecha | Click move | Enter crafta", True, (255,255,255))
        self.area_desenho.blit(titulo, (px+20, py+10))
        
        cols = 8
        gap = 6
        x0 = px + 20
        y0 = py + 50
        for i in range(INVENTARIO_SLOTS):
            col = i % cols
            lin = i // cols
            x = x0 + col*(SLOT_SIZE+gap)
            y = y0 + lin*(SLOT_SIZE+gap)
            self._desenhar_slot(x, y, self.inventario[i])
        
        cx = px + pw - 240
        cy = py + 50
        pygame.draw.rect(self.area_desenho, (50,80,50), (cx, cy, 200, 220))
        pygame.draw.rect(self.area_desenho, (200,220,200), (cx, cy, 200, 220), 2)
        
        for i in range(CRAFT_SLOTS):
            col = i % 3
            lin = i // 3
            x = cx + 10 + col*(SLOT_SIZE+2)
            y = cy + 10 + lin*(SLOT_SIZE+2)
            self._desenhar_slot(x, y, self.craft_grid[i], tam=40)
        
        sx = cx + 80
        sy = cy + 88
        pygame.draw.polygon(self.area_desenho, (255,255,255), [(sx,sy+8),(sx+24,sy+8),(sx+32,sy),(sx+32,sy+16),(sx+24,sy+8)])
        self._desenhar_slot(sx+36, sy-4, self.craft_resultado, tam=48)
        
        craft_txt = self.fonte.render(f"CRAFT: {self._craft_resultado_texto()}", True, (255,255,255))
        self.area_desenho.blit(craft_txt, (cx+10, cy+190))
    
    def _craft_resultado_texto(self):
        if eh_vazio(self.craft_resultado): return "---"
        return f"{BLOCKS[self.craft_resultado['tipo']]['nome']} x{self.craft_resultado['qtd']}"
    
    def _craftar(self):
        self.craft_resultado = criar_slot()
        # Build material map from grid
        mats = {}
        for s in self.craft_grid:
            if s["tipo"] is not None:
                mats[s["tipo"]] = mats.get(s["tipo"], 0) + s["qtd"]
        for rec in RECEITAS:
            ok = True
            for t, q in rec["ingredientes"].items():
                if mats.get(t, 0) < q:
                    ok = False; break
            if ok:
                self.craft_resultado = criar_slot(rec["resultado"], rec["quantidade"])
                # consume
                for t, q in rec["ingredientes"].items():
                    rest = q
                    for s in self.craft_grid:
                        if rest <= 0: break
                        if s["tipo"] == t:
                            take = min(s["qtd"], rest)
                            s["qtd"] -= take
                            rest -= take
                            if s["qtd"] <= 0: s["tipo"] = None; s["qtd"] = 0
                return
    
    def _desenhar(self):
        self.redimensionar()
        surf = self.area_desenho = self.superficie_render
        w, h = surf.get_size()
        self._desenhar_mundo(w, h)
        if not self.mostrar_inv:
            self.ultimo_alvo = self.alvo_construcao()
            self._desenhar_ghost(self.ultimo_alvo, *self._camera_basis(), w, h)
            pygame.draw.line(surf, (255,255,255), (w//2-12, h//2), (w//2+12, h//2), 2)
            pygame.draw.line(surf, (255,255,255), (w//2, h//2-12), (w//2, h//2+12), 2)
            self._desenhar_hotbar(w, h)
        else:
            self._desenhar_inventario(w, h)
        pygame.transform.scale(surf, self.tela.get_size(), self.tela)
        pygame.display.flip()
    
    def _desenhar_ghost(self, alvo, fwd, rgt, up, w, h):
        if not alvo: return
        bloco = alvo["novo"]
        cor = (70,255,90) if alvo["valido"] else (255,70,70)
        for n in FACE_NORMALS:
            pts = []
            for v in block_face(bloco, n):
                p = self._projetar(v, fwd, rgt, up, w, h)
                if p is None: pts=[]; break
                pts.append((p[0], p[1]))
            if pts: pygame.draw.polygon(self.area_desenho, cor, pts, 2)
    
    def _slot_from_mouse(self, mx, my):
        if not self.mostrar_inv: return None, None
        px, py, pw, ph = self._inv_rect()
        x0 = px+20; y0 = py+50; cols=8; gap=6
        ww = self.tela.get_size()[0]
        # Adjust for scaling
        sx = mx * self.area_desenho.get_width() / ww
        sy = my * self.area_desenho.get_height() / self.tela.get_height()
        for i in range(INVENTARIO_SLOTS):
            col = i % cols; lin = i // cols
            rx = x0 + col*(SLOT_SIZE+gap)
            ry = y0 + lin*(SLOT_SIZE+gap)
            if rx <= sx <= rx+SLOT_SIZE and ry <= sy <= ry+SLOT_SIZE:
                return i, clonar(self.inventario[i])
        return None, None
    
    def _inv_rect(self):
        w, h = self.tela.get_size()
        pw, ph = 600, 380
        return w//2 - pw//2, 30, pw, ph
    
    def _transfer(self, src, dst, qtd=None):
        if eh_vazio(src) or dst is None: return
        q = qtd if qtd is not None else src["qtd"]
        q = min(q, src["qtd"])
        if eh_vazio(dst):
            dst["tipo"] = src["tipo"]
            dst["qtd"] = q
            src["qtd"] -= q
            if src["qtd"] <= 0: src["tipo"] = None; src["qtd"] = 0
        elif dst["tipo"] == src["tipo"]:
            free = MAX_STACK - dst["qtd"]
            t2 = min(free, q)
            dst["qtd"] += t2
            src["qtd"] -= t2
            if src["qtd"] <= 0: src["tipo"] = None; src["qtd"] = 0
    
    def interagir(self, botao):
        alvo = self.alvo_construcao()
        if not alvo: return
        ativo = self._hotbar_ativo()
        if botao == 1:
            bloco = alvo["bloco"]
            if bloco in self.mundo:
                tipo = self.mundo.pop(bloco)
                self._achar_slot(tipo, 1)
                self.limpar_dados_bloco(bloco)
                self._on_block_changed(bloco)
        elif botao == 3:
            if ativo is not None:
                novo = alvo["novo"]
                if alvo["valido"]:
                    # Ensure we have item
                    slot = None
                    for s in self.inventario:
                        if s["tipo"] == ativo and s["qtd"] > 0:
                            slot = s; break
                    if slot:
                        self._consumir_slot(slot)
                        self.mundo[novo] = ativo
                self.limpar_dados_bloco(novo)
                self._on_block_changed(novo)
    
    def loop(self):
        while True:
            dt = min(self.relogio.tick(60)/1000.0, 0.05)
            teclas = pygame.key.get_pressed()
            for ev in pygame.event.get():
                if ev.type == pygame.QUIT:
                    pygame.quit(); sys.exit()
                if ev.type == pygame.KEYDOWN:
                    if ev.key == pygame.K_e:
                        self.mostrar_inv = not self.mostrar_inv
                        self.mouse_capturado = not self.mostrar_inv
                        pygame.event.set_grab(self.mouse_capturado)
                        pygame.mouse.set_visible(not self.mouse_capturado)
                        if self.mostrar_inv: self._craftar()
                    if ev.key == pygame.K_ESCAPE:
                        if self.mostrar_inv:
                            self.mostrar_inv = False
                            self.mouse_capturado = True
                            pygame.event.set_grab(True)
                            pygame.mouse.set_visible(False)
                        else:
                            self.mouse_capturado = not self.mouse_capturado
                            pygame.event.set_grab(self.mouse_capturado)
                            pygame.mouse.set_visible(not self.mouse_capturado)
                    elif ev.key == pygame.K_RETURN and self.mostrar_inv:
                        self._craftar()
                    elif ev.key == pygame.K_BACKSPACE and self.mostrar_inv:
                        self.craft_grid = [criar_slot() for _ in range(CRAFT_SLOTS)]
                        self.craft_resultado = criar_slot()
                    elif ev.key == pygame.K_r:
                        self.reset_jogador()
                    elif pygame.K_1 <= ev.key <= pygame.K_1 + HOTBAR_SLOTS - 1:
                        idx = ev.key - pygame.K_1
                        sel = self.hotbar[idx]
                        if sel["qtd"] > 0 and sel["tipo"] is not None:
                            # Swap selected to idx
                            self.hotbar[idx] = criar_slot()
                            # Find first empty with active type
                            for s in self.hotbar:
                                if s["tipo"] == sel["tipo"] and s["qtd"] < MAX_STACK:
                                    s["qtd"] += sel["qtd"]
                                    break
                            else:
                                for i, s in enumerate(self.hotbar):
                                    if eh_vazio(s):
                                        self.hotbar[i] = sel; break
                if ev.type == pygame.MOUSEBUTTONDOWN:
                    if self.mostrar_inv:
                        mx, my = ev.pos
                        idx, _ = self._slot_from_mouse(mx, my)
                        if idx is not None:
                            self.arrastando = idx
                    elif self.mouse_capturado:
                        self.interagir(ev.button)
                if ev.type == pygame.MOUSEBUTTONUP:
                    if self.arrastando is not None and self.mostrar_inv:
                        mx, my = pygame.mouse.get_pos()
                        dst, _ = self._slot_from_mouse(mx, my)
                        if dst is not None and dst != self.arrastando:
                            self._transfer(self.inventario[self.arrastando], self.inventario[dst])
                        self.arrastando = None
                if ev.type == pygame.MOUSEMOTION and self.mostrar_inv:
                    mx, my = ev.pos
                    idx, _ = self._slot_from_mouse(mx, my)
                    if self.arrastando is not None and idx is not None and idx != self.arrastando:
                        self._transfer(self.inventario[self.arrastando], self.inventario[idx])
                if ev.type == pygame.VIDEORESIZE:
                    self.tela = pygame.display.set_mode((ev.w, ev.h), pygame.RESIZABLE)
                    self.redimensionar()
            if self.mouse_capturado and not self.mostrar_inv:
                dx, dy = pygame.mouse.get_rel()
                self.yaw += dx * 0.0022
                self.pitch -= dy * 0.0022
                self.pitch = clamp(self.pitch, -1.48, 1.48)
                self.atualizar(dt, teclas)
            self._desenhar()

def main():
    j = Jogo()
    pygame.event.set_grab(j.mouse_capturado)
    pygame.mouse.set_visible(not j.mouse_capturado)
    j.loop()

if __name__ == "__main__":
    main()
