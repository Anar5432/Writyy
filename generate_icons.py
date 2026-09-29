import math
from PIL import Image, ImageDraw, ImageFilter

def create_cool_writyy_icon(size=512):
    scale = 4
    w = size * scale
    h = size * scale
    
    # 1. Base canvas
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 2. Rich Deep Gradient Background (Oxford Midnight to Royal Blue)
    # #091326 -> #0f2757 -> #1a428a -> #1d4ed8
    c1 = (8, 18, 38)      # Top-left midnight
    c2 = (15, 43, 94)     # Center oxford
    c3 = (26, 70, 150)    # Lower right vibrant royal
    
    for y in range(h):
        for x in range(0, w, 4):
            t = (x * 0.7 + y * 1.3) / (w * 0.7 + h * 1.3)
            if t < 0.5:
                f = t / 0.5
                r = int(c1[0] + (c2[0] - c1[0]) * f)
                g = int(c1[1] + (c2[1] - c1[1]) * f)
                b = int(c1[2] + (c2[2] - c1[2]) * f)
            else:
                f = (t - 0.5) / 0.5
                r = int(c2[0] + (c3[0] - c2[0]) * f)
                g = int(c2[1] + (c3[1] - c2[1]) * f)
                b = int(c2[2] + (c3[2] - c2[2]) * f)
            draw.rectangle([x, y, x + 4, y], fill=(r, g, b, 255))
            
    # Ambient soft light highlight from top-center
    highlight = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    h_draw = ImageDraw.Draw(highlight)
    h_draw.ellipse(
        [int(w * 0.15), -int(h * 0.2), int(w * 0.85), int(h * 0.7)],
        fill=(56, 189, 248, 45) # Sky blue ambient
    )
    highlight = highlight.filter(ImageFilter.GaussianBlur(radius=scale * 50))
    img = Image.alpha_composite(img, highlight)
    
    def s(val):
        return int(val * scale)
    
    # 3. Soft Hairline Inner Glow Ring / Border for App Store aesthetic
    border_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border_layer)
    b_draw.rounded_rectangle(
        [s(16), s(16), s(496), s(496)],
        radius=s(110),
        outline=(255, 255, 255, 30),
        width=s(3)
    )
    img = Image.alpha_composite(img, border_layer)
    
    # 4. Bold Modern "W" Iconography
    # Centered and punchy:
    # W coordinates:
    p1 = (s(100), s(165))
    p2 = (s(176), s(370))
    p3 = (s(256), s(240))
    p4 = (s(336), s(370))
    p5 = (s(412), s(165))
    
    stroke_w = s(52) # Bold, confident thickness
    
    # Deep Ambient Shadow for 3D Floating Elevation
    shadow_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_layer)
    
    offset_y = s(12)
    s_pts = [(pt[0], pt[1] + offset_y) for pt in [p1, p2, p3, p4, p5]]
    s_draw.line(s_pts, fill=(3, 8, 20, 180), width=stroke_w, joint='round')
    for pt in s_pts:
        s_draw.ellipse(
            [pt[0] - stroke_w // 2, pt[1] - stroke_w // 2, pt[0] + stroke_w // 2, pt[1] + stroke_w // 2],
            fill=(3, 8, 20, 180)
        )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=scale * 10))
    img = Image.alpha_composite(img, shadow_layer)
    
    # Foreground Layer
    fg = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    fg_draw = ImageDraw.Draw(fg)
    
    # Draw left wing (subtle dual-tone for dimension: left half slightly shaded, right half pure bright white)
    # Left V: p1 -> p2 -> p3
    fg_draw.line([p1, p2, p3], fill=(238, 244, 255, 255), width=stroke_w, joint='round')
    for pt in [p1, p2]:
        fg_draw.ellipse(
            [pt[0] - stroke_w // 2, pt[1] - stroke_w // 2, pt[0] + stroke_w // 2, pt[1] + stroke_w // 2],
            fill=(238, 244, 255, 255)
        )
        
    # Right V: p3 -> p4 -> p5 in pure crisp white
    fg_draw.line([p3, p4, p5], fill=(255, 255, 255, 255), width=stroke_w, joint='round')
    for pt in [p3, p4, p5]:
        fg_draw.ellipse(
            [pt[0] - stroke_w // 2, pt[1] - stroke_w // 2, pt[0] + stroke_w // 2, pt[1] + stroke_w // 2],
            fill=(255, 255, 255, 255)
        )
        
    # Fountain Pen Nib Center Accent (Auditory & Spelling precision symbol)
    # A sleek vertical slit cut down from p3
    fg_draw.line([(s(256), s(240)), (s(256), s(285))], fill=(15, 39, 87, 255), width=s(7))
    fg_draw.ellipse(
        [s(256) - s(4), s(285) - s(4), s(256) + s(4), s(285) + s(4)],
        fill=(56, 189, 248, 255) # Electric cyan breather hole
    )
    
    # 5. Iconic Crimson Red Dot (The signature "lazywrityy.")
    dot_center = (s(428), s(142))
    dot_radius = s(28)
    
    # Red Dot Glow Aura
    dot_glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    dg_draw = ImageDraw.Draw(dot_glow)
    dg_draw.ellipse(
        [dot_center[0] - dot_radius * 2, dot_center[1] - dot_radius * 2,
         dot_center[0] + dot_radius * 2, dot_center[1] + dot_radius * 2],
        fill=(225, 29, 72, 140)
    )
    dot_glow = dot_glow.filter(ImageFilter.GaussianBlur(radius=scale * 9))
    img = Image.alpha_composite(img, dot_glow)
    
    # Solid Red Dot Circle
    fg_draw.ellipse(
        [dot_center[0] - dot_radius, dot_center[1] - dot_radius,
         dot_center[0] + dot_radius, dot_center[1] + dot_radius],
        fill=(225, 29, 72, 255) # Crimson #e11d48
    )
    
    # Glossy light reflection on dot
    refl_r = int(dot_radius * 0.38)
    fg_draw.ellipse(
        [dot_center[0] - s(9) - refl_r, dot_center[1] - s(9) - refl_r,
         dot_center[0] - s(9) + refl_r, dot_center[1] - s(9) + refl_r],
        fill=(255, 185, 200, 200)
    )
    
    # Composite foreground
    img = Image.alpha_composite(img, fg)
    
    # Downsample with Lanczos
    return img.resize((size, size), Image.Resampling.LANCZOS)

if __name__ == '__main__':
    icon_512 = create_cool_writyy_icon(512)
    icon_512.save('public/icon-512.png')
    
    icon_192 = icon_512.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save('public/icon-192.png')
    
    icon_180 = icon_512.resize((180, 180), Image.Resampling.LANCZOS)
    icon_180.save('public/apple-touch-icon.png')
    icon_180.save('public/apple-touch-icon-precomposed.png')
    
    print('Generated new ultra-cool icons!')
