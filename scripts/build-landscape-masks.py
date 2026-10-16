#!/usr/bin/env python3
"""Rebuild code-native SVG terrain mattes without repainting any artwork.

Requires Python 3, Pillow, NumPy and SciPy (build tools only). Run from anywhere:
  python scripts/build-landscape-masks.py [--preview-dir /tmp/mhri-mattes]

The leafy original and bare winter plate need different coverage: an opaque
leafy silhouette would leave the old sky inside winter's branch openings.
Color separation preserves fine branches; a bounded distant-horizon search
keeps terrain and lake opaque. The conservative upper envelope only excludes
unrelated sky clouds; it does not supply the final outline. Alpha is encoded
as 16 native SVG path layers, not an embedded raster. Original art is untouched.
"""
from pathlib import Path
import argparse
import hashlib
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1774, 887
# Broad source-derived envelope, sampled every 8px (last sample at x=1773).
# Derived from the original matte's outer canopy, expanded 20px horizontally
# and 12px vertically. Unlike the old matte, this NEVER forces pixels opaque.
UPPER_ENVELOPE = [38,38,33,33,20,16,16,7,6,6,5,5,5,5,5,7,7,6,6,6,6,6,11,11,18,24,30,39,56,79,106,147,147,147,147,147,162,162,168,169,180,192,203,222,222,229,229,235,251,258,284,396,396,396,372,368,366,355,351,296,277,277,270,270,229,219,205,201,201,193,190,190,181,168,166,163,163,163,163,163,164,177,190,201,201,203,203,221,241,242,248,265,265,265,269,347,358,361,364,370,380,380,384,392,403,405,411,418,431,459,485,485,485,485,492,492,478,465,461,446,443,426,426,426,411,411,411,411,411,415,420,423,423,423,432,432,432,435,435,435,440,440,445,448,456,456,464,470,477,509,545,546,546,547,547,547,548,548,549,549,550,549,546,537,529,527,522,520,517,514,512,512,512,512,512,513,516,520,523,524,523,521,519,518,516,516,516,516,516,517,509,501,500,499,357,348,335,327,319,316,312,310,310,279,266,264,259,255,255,255,255,255,257,257,257,257,263,263,270,273,275,275,286]
# Distant ridge behind the near trees. These bounds are independent of the
# canopy silhouette, so clearing tree gaps cannot erase the lower landscape.
HORIZON = [(0,545),(260,545),(300,500),(330,477),(355,470),(380,476),(410,482),(440,491),(470,495),(530,505),(620,512),(710,520),(800,528),(840,526),(860,522),(880,518),(900,521),(920,522),(940,534),(980,549),(1050,560),(1110,572),(1150,573),(1180,572),(1210,572),(1250,573),(1290,573),(1330,570),(1360,566),(1410,566),(1460,566),(1510,560),(1570,552),(1640,555),(1773,560)]


def smoothstep(lo, hi, value):
    t = np.clip((value-lo)/(hi-lo), 0, 1)
    return t*t*(3-2*t)


def make_alpha(source, dormant=False):
    rgb = np.asarray(source.convert('RGB'), dtype=float)
    if rgb.shape != (HEIGHT, WIDTH, 3):
        raise ValueError('Source geometry changed; review the skyline bounds before rebuilding.')
    r, g, b = rgb.transpose(2,0,1)
    lum = (r+g+b)/3
    x, y = np.meshgrid(np.arange(WIDTH), np.arange(HEIGHT))
    upper = np.interp(np.arange(WIDTH), list(range(0,WIDTH,8))+[WIDTH-1], UPPER_ENVELOPE)
    envelope = smoothstep(upper-2, upper+2, y)
    expected = np.interp(np.arange(WIDTH), *np.array(HORIZON).T)
    # Locate the small sky-to-distant-land luminance drop near the reviewed
    # ridge, instead of baking a straight or polygonal skyline into the mask.
    blurred = nd.gaussian_filter(lum, 1.5)
    drop = np.roll(blurred, 3, axis=0)-np.roll(blurred,-3,axis=0)
    near = np.abs(y-expected)
    score = drop - near*1.15
    score[near>8] = -np.inf
    ridge = np.argmax(score,axis=0)
    ridge = nd.median_filter(ridge,size=9)
    terrain = smoothstep(ridge-1, ridge+2, y)
    if dormant:
        chroma = smoothstep(2,11,g-b)*smoothstep(150,95,lum)
    else:
        chroma = smoothstep(3,13,(g-b)-.45*(r-g))*smoothstep(155,105,lum)
    # Dark bark is neutral, unlike olive leaves; preserve it without adding
    # the brighter neutral sky between branches to the foreground.
    bark = smoothstep(81,58,lum)
    alpha = np.maximum(terrain, np.maximum(chroma,bark)*envelope)
    # Remove detached warm-cloud flecks, but retain small antialiased leaves
    # beside connected canopy. No broad feathering: twig edges stay crisp.
    labels, _ = nd.label(alpha>.25)
    sizes = np.bincount(labels.ravel())
    connected = sizes[labels]>45
    alpha *= nd.maximum_filter(connected,size=3)
    return np.uint8(np.clip(alpha,0,1)*255)


def write_svg(alpha, path, source):
    quantized = np.rint(alpha/255*15).astype(np.uint8)
    layers = [[] for _ in range(16)]
    for y,row in enumerate(quantized):
        transitions = np.flatnonzero(np.r_[True,row[1:]!=row[:-1],True])
        for start,end in zip(transitions[:-1],transitions[1:]):
            value = int(row[start])
            if value:
                layers[value].append(f'M{start} {y}h{end-start}v1H{start}z')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    text = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}">',
            f'<!-- Rebuild: scripts/build-landscape-masks.py; source: {source.name}; sha256: {digest} -->']
    for level,paths in enumerate(layers):
        if paths:
            text.append(f'<path fill="white" fill-opacity="{level/15:.3f}" d="{"".join(paths)}"/>')
    text.append('</svg>\n')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text('\n'.join(text))
    return quantized


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-dir', type=Path)
    args=parser.parse_args()
    masks=ROOT/'public/art/environments/masks'
    for name,relative,dormant in [('leafy','public/art/landscape-wide.png',False),('dormant','public/art/environments/winter.webp',True)]:
        path=ROOT/relative
        source=Image.open(path)
        alpha=make_alpha(source,dormant)
        output=masks/f'{name}.svg'
        quantized=write_svg(alpha,output,path)
        if name=='leafy':
            write_svg(alpha,ROOT/'public/art/landscape-foreground-mask-v2.svg',path)
        print(f'{output.relative_to(ROOT)}: {output.stat().st_size:,} bytes; {np.mean(alpha==0):.1%} transparent')
        # These are inspection-only composites outside public/art. Never save
        # a modified painting or replacement image as a production asset.
        if args.preview_dir:
            args.preview_dir.mkdir(parents=True,exist_ok=True)
            preview=Image.new('RGB',source.size,(30,45,76))
            preview.paste(source,mask=Image.fromarray(quantized*17))
            preview.resize((887,444)).save(args.preview_dir/f'{name}.png')
            Image.fromarray(quantized*17).save(args.preview_dir/f'{name}-alpha.png')


if __name__=='__main__':
    main()
