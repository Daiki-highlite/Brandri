#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全記事・ニュースの高品質サムネ(1200x630 PNG)を、タイトルのキーワード連動で生成。
gen-thumb.mjs のパレット/モチーフ設計を踏襲し、OGP/カバー/カード共通で使える PNG を出力する。
出力: project/assets/covers/<key>.png  （articles: j-<slug> / news: <id>）"""
import json, math, os, re, hashlib
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = "/Users/daikihayakawa/Documents/Claude/Projects/Brandri-ブランドメディア"
OUT = f"{ROOT}/project/assets/covers"
os.makedirs(OUT, exist_ok=True)
W, H = 1200, 630

PALETTES = [
    ["#1E2340", "#3D5070", "#9B8CC8"],
    ["#3D5070", "#7BBAD4", "#EBEBEB"],
    ["#9B8CC8", "#C8A4C4", "#1E2340"],
    ["#7BBAD4", "#8CC4D0", "#3D5070"],
    ["#C8A4C4", "#9B8CC8", "#7BBAD4"],
    ["#1E2340", "#8CC4D0", "#C8A4C4"],
]
def hx(c):
    c = c.lstrip("#"); return (int(c[0:2],16), int(c[2:4],16), int(c[4:6],16))

def seed_of(s):
    return int(hashlib.md5(s.encode("utf-8")).hexdigest()[:8], 16)

class RNG:
    def __init__(self, seed): self.a = seed & 0xffffffff
    def __call__(self):
        self.a = (self.a + 0x6D2B79F5) & 0xffffffff
        t = self.a
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xffffffff
        t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xffffffff)) & 0xffffffff
        t ^= t
        return (((self.a ^ (self.a >> 14)) & 0xffffffff)) / 4294967296.0

def LIGHT(o): return (250, 246, 236, int(255 * o))

# タイトル → (palette index, motif key)。上から順にマッチ。
THEMES = [
    (2, "rebrand", r"リブランド|リブランディング|刷新|社名変更|ロゴ変更|再定義|再構築|生まれ変わ|継|暖簾|看板"),
    (3, "ai", r"AI|生成|エージェント|LLM|DX|デジタル|データ|テック|自動化|検証|購買"),
    (4, "hiring", r"採用|人材|エンプロイヤー|求人|入社|組織|人な|離職|定着|30人"),
    (0, "manage", r"経営|戦略|事業|上場|IPO|投資|M&A|買収|提携|拡張|グループ|価格|利益|費用|コスト|継承|BtoB|会社"),
    (2, "design", r"デザイン|VI|ロゴ|クリエイティブ|アート|ビジュアル|パッケージ|ガイドライン|トーン|声|表情|物語|ストーリー|タグライン|コンセプト"),
    (5, "experience", r"体験|顧客|CX|UX|接点|コミュニ|共感|ファン|ロイヤ|想起|記憶|認知|名|選ばれ|指名|信頼|地域|D2C"),
    (1, "measure", r"調査|指標|計測|ランキング|統計|効果|ROI|売上|成長|突破|達成|億|測|エクイティ|KPI|資産|周年"),
]
def pick_theme(title):
    for pal, key, rx in THEMES:
        if re.search(rx, title): return pal, key
    return None, "crystal"

def lerp(a, b, t): return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def gradient(c0, c1, angle_down=True):
    base = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(base)
    for y in range(H):
        d.line([(0,y),(W,y)], fill=lerp(c0, c1, y/H))
    return base

def draw(key, title, pal_idx):
    rnd = RNG(seed_of(title or key))
    pal = PALETTES[pal_idx if pal_idx is not None else seed_of(title) % len(PALETTES)]
    p0, p1, p2 = hx(pal[0]), hx(pal[1]), hx(pal[2])
    # 背景: 深い→淡い斜めグラデ（暗めに寄せて文字なしでも重厚に）
    dark = lerp(p0, (16,18,32), 0.35)
    mid = lerp(p1, p0, 0.35)
    img = gradient(dark, mid).convert("RGBA")

    # 斜めのライトグラデを重ねて奥行き
    diag = Image.new("RGBA", (W, H), (0,0,0,0))
    dd = ImageDraw.Draw(diag)
    for i in range(W+H):
        t = i/(W+H)
        col = (*lerp(p2, p1, t), int(46*(1-t)))
        dd.line([(i,0),(i-H,H)], fill=col)
    img = Image.alpha_composite(img, diag)

    # コーナーの柔らかいグロー
    glow = Image.new("RGBA", (W,H), (0,0,0,0))
    ImageDraw.Draw(glow).ellipse([W*0.55, -H*0.5, W*1.25, H*0.7], fill=(*lerp(p2,(255,255,255),0.3), 70))
    glow = glow.filter(ImageFilter.GaussianBlur(140))
    img = Image.alpha_composite(img, glow)

    ov = Image.new("RGBA", (W,H), (0,0,0,0))
    d = ImageDraw.Draw(ov)
    r = rnd

    if key == "rebrand":
        for i in range(4):
            x = W*0.20 + i*24; y = H*0.56 - i*30
            lay = Image.new("RGBA",(W,H),(0,0,0,0))
            ImageDraw.Draw(lay).rounded_rectangle([x,y,x+360,y+240], 8, fill=LIGHT(0.06+i*0.04))
            ov = Image.alpha_composite(ov, lay.rotate(-8+i*2, center=(x,y)))
        lay = Image.new("RGBA",(W,H),(0,0,0,0))
        ld = ImageDraw.Draw(lay)
        ld.rounded_rectangle([W*0.5, H*0.14, W*0.5+360, H*0.14+230], 8, fill=(*p2,220))
        ld.line([W*0.5+40, H*0.14+64, W*0.5+250, H*0.14+64], fill=LIGHT(0.5), width=8)
        ov = Image.alpha_composite(ov, lay.rotate(9, center=(W*0.5,H*0.14)))
    elif key == "ai":
        pts = [(W*(0.18+r()*0.64), H*(0.18+r()*0.64)) for _ in range(8)]
        for i in range(len(pts)):
            for j in range(i+1, len(pts)):
                if r() > 0.5: continue
                d.line([pts[i], pts[j]], fill=LIGHT(0.22), width=2)
        for i,(x,y) in enumerate(pts):
            rr = 14 if i%3==0 else 7
            d.ellipse([x-rr,y-rr,x+rr,y+rr], fill=(*p2,235) if i%2 else LIGHT(0.85))
    elif key == "hiring":
        cx, cy = W*0.5, H*0.5
        d.ellipse([cx-70,cy-70,cx+70,cy+70], outline=LIGHT(0.55), width=3)
        d.ellipse([cx-16,cy-16,cx+16,cy+16], fill=(*p2,235))
        for _ in range(16):
            a = r()*math.tau; dist = 210+r()*260
            x, y = cx+math.cos(a)*dist, cy+math.sin(a)*dist
            d.line([(x,y),(cx+math.cos(a)*90, cy+math.sin(a)*90)], fill=LIGHT(0.20), width=2)
            rr = 3+r()*4; d.ellipse([x-rr,y-rr,x+rr,y+rr], fill=LIGHT(0.7))
    elif key == "manage":
        n=6; bw=76; gap=44; total=n*bw+(n-1)*gap; x0=(W-total)/2
        for i in range(n):
            h=140+r()*300; x=x0+i*(bw+gap); y=H*0.84-h
            d.rectangle([x,y,x+bw,H*0.84], fill=(*p2,225) if i%2 else LIGHT(0.14))
            d.rectangle([x,y-10,x+bw,y-4], fill=LIGHT(0.5))
    elif key == "design":
        for i in range(3):
            cx=W*(0.4+r()*0.2); cy=H*(0.45+r()*0.1); sz=200+r()*130; rot=r()*60
            lay=Image.new("RGBA",(W,H),(0,0,0,0))
            pp=[(cx,cy-sz),(cx-sz*0.87,cy+sz*0.5),(cx+sz*0.87,cy+sz*0.5)]
            ImageDraw.Draw(lay).polygon(pp, fill=(*p2,150) if i==1 else LIGHT(0.10), outline=LIGHT(0.4))
            ov=Image.alpha_composite(ov, lay.rotate(rot, center=(cx,cy)))
    elif key == "experience":
        cx, cy = W*(0.3+r()*0.35), H*0.5
        for i in range(6,0,-1):
            rr=i*62; d.ellipse([cx-rr,cy-rr,cx+rr,cy+rr], outline=LIGHT(max(0.05,0.5-i*0.06)), width=max(1,int(3-i*0.3)))
        d.ellipse([cx-13,cy-13,cx+13,cy+13], fill=(*p2,235))
    elif key == "measure":
        n=7; bw=62; gap=46; total=n*bw+(n-1)*gap; x0=(W-total)/2; tops=[]
        for i in range(n):
            h=80+(i/n)*300+r()*60; x=x0+i*(bw+gap); y=H*0.84-h
            tops.append((x+bw/2,y)); d.rectangle([x,y,x+bw,H*0.84], fill=LIGHT(0.12))
        d.line(tops, fill=(*p2,235), width=5)
        for x,y in tops: d.ellipse([x-6,y-6,x+6,y+6], fill=LIGHT(0.9))
    else:  # crystal
        for _ in range(3):
            cx=W*(0.2+r()*0.6); cy=H*(0.2+r()*0.6); rr=80+r()*280
            d.ellipse([cx-rr,cy-rr,cx+rr,cy+rr], outline=LIGHT(0.18), width=2)
        cx=W*(0.32+r()*0.36); cy=H*(0.3+r()*0.4); n=5+int(r()*3); r0=100+r()*150
        poly=[]
        for k in range(n):
            a=math.tau*k/n+r()*0.4; rr=r0*(0.7+r()*0.5)
            poly.append((cx+math.cos(a)*rr, cy+math.sin(a)*rr))
        d.polygon(poly, fill=(*p2,120), outline=LIGHT(0.5))

    img = Image.alpha_composite(img, ov)

    # きらめき（1〜2点）
    for _ in range(1+int(r()*2)):
        x,y = W*(0.1+r()*0.8), H*(0.12+r()*0.5); s=10+r()*16
        sp=Image.new("RGBA",(W,H),(0,0,0,0))
        ImageDraw.Draw(sp).polygon([(x,y-s),(x+s*0.16,y-s*0.16),(x+s,y),(x+s*0.16,y+s*0.16),
                                    (x,y+s),(x-s*0.16,y+s*0.16),(x-s,y),(x-s*0.16,y-s*0.16)], fill=LIGHT(0.9))
        img = Image.alpha_composite(img, sp)

    # 微粒子ノイズ（質感）
    noise = Image.effect_noise((W,H), 12).convert("L")
    noise = ImageChops.multiply(noise, Image.new("L",(W,H),36))
    img = Image.composite(Image.new("RGBA",(W,H),(255,255,255,10)), img, noise).convert("RGB") if False else img
    grain = Image.merge("RGBA",[noise]*3+[Image.new("L",(W,H),14)])
    img = Image.alpha_composite(img, grain)

    return img.convert("RGB")

def main():
    arts = json.load(open(f"{ROOT}/project/data/articles.json", encoding="utf-8"))["items"]
    news = json.load(open(f"{ROOT}/project/data/news.json", encoding="utf-8"))["items"]
    n = 0
    for a in arts:
        if not a.get("slug"): continue
        pal, key = pick_theme(a["title"] + " " + (a.get("keyword") or ""))
        img = draw(key, a["title"], pal)
        img.save(f"{OUT}/j-{a['slug']}.jpg", "JPEG", quality=84, optimize=True)
        n += 1
    for it in news:
        if not (it.get("headline") and it.get("sections")): continue
        title = it.get("headline") or it.get("title")
        pal, key = pick_theme(title)
        img = draw(key, title, pal)
        img.save(f"{OUT}/{it['id']}.jpg", "JPEG", quality=84, optimize=True)
        n += 1
    print(f"✓ {n} covers → assets/covers/")

if __name__ == "__main__":
    main()
