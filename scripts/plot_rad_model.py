# Figure 2 in docs/RESEARCH.md: (a) background dose vs air pressure (Guo et al. 2015 fit),
# (b) the RAD nowcast (Löwe et al. 2025) applied to the May 2024 event replayed in the app.
import json, math
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
rad = json.loads((ROOT / 'public/data/rad.json').read_text())
meda = json.loads((ROOT / 'public/data/meda_sol.json').read_text())
D0, PREF, K, KERR = rad['baseline']['uGyPerDay'], 840, -0.13, 0.02
ps = [b['P'] for b in meda['bins'] if b.get('P')]
INK, INK2, GRID, SURF = '#0b0b0b', '#52514e', '#e4e3df', '#fcfcfb'
B1, B2 = '#2a78d6', '#eb6834'
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9, 'axes.edgecolor': INK2, 'xtick.color': INK2, 'ytick.color': INK2,
                     'axes.spines.top': False, 'axes.spines.right': False, 'axes.linewidth': 0.8, 'figure.facecolor': SURF, 'axes.facecolor': SURF})
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 4.1))

# (a)
P = [500 + i for i in range(0, 551, 5)]
D = lambda p, k=K: D0 + k * (p - PREF)
a.fill_between(P, [D(p, K - KERR) for p in P], [D(p, K + KERR) for p in P], color=B1, alpha=0.15, lw=0)
a.plot(P, [D(p) for p in P], color=B1, lw=2, label='D = D₀ + κ(P − 840 Pa), κ = −0.13 ± 0.02')
a.plot([PREF], [D0], 'o', ms=8, color=INK, mec=SURF, mew=2, zorder=5)
a.annotate(f'Gale: RAD {D0:.0f} µGy/day\nat 840 Pa (measured)', (PREF, D0), (PREF + 15, D0 + 12), fontsize=8, color=INK)
lo, hi = min(ps), max(ps)
a.plot([lo, hi], [D(lo), D(hi)], color=B2, lw=6, solid_capstyle='round', zorder=4)
a.annotate(f'Jezero: MEDA {lo:.0f}–{hi:.0f} Pa\n→ {D(hi):.0f}–{D(lo):.0f} µGy/day (model)', ((lo + hi) / 2, D((lo + hi) / 2)), (520, D(560) - 30), fontsize=8, color=INK,
           arrowprops=dict(arrowstyle='-', color=INK2, lw=0.8))
p2k = 625 * math.exp(-2000 / 11100)
a.plot([p2k], [D(p2k)], 's', ms=6, color=B2, mec=SURF, mew=1.5, zorder=5)
a.annotate('Jezero +2 km higher\n(model)', (p2k, D(p2k)), (p2k + 18, D(p2k) + 2), fontsize=8, color=INK2, va='center')
a.set_xlim(500, 1050); a.set_xlabel('Surface air pressure (Pa)'); a.set_ylabel('Quiet dose rate (µGy/day)')
a.grid(axis='y', color=GRID, lw=0.8); a.set_axisbelow(True)
a.legend(loc='lower left', frameon=False, fontsize=8)
a.set_title('(a) More air overhead, lower dose', loc='left', fontsize=10, fontweight='bold', color=INK)

# (b)
S = rad['sep']; t = [h * 60 for h in S['tH']]; v = S['uGyPerDay']
b.plot(t, v, color=B1, lw=2, label='RAD dose rate, 20 May 2024 (replayed)')
b.axhline(D0, color=INK2, lw=1, ls=(0, (2, 2)))
b.axhline(1.25 * D0, color=B2, lw=1.5, label='Trigger: 1.25 × background')
b.text(175, D0 * 0.9, 'background', ha='right', va='top', fontsize=8, color=INK2)
for x, lab in [(0, 'trigger\n(first reading)'), (15, 'confirmed\n15–30 min')]:
    b.axvline(x, color=B2, lw=1, ls=(0, (2, 2)))
    b.text(x + 1.5, 1500 if x == 15 else 600, lab, fontsize=8, color=INK)
k = max(range(len(v)), key=lambda i: v[i])
b.plot([t[k]], [v[k]], 'o', ms=7, color=B1, mec=SURF, mew=2, zorder=5)
b.text(t[k] + 4, v[k], f'peak {t[k]:.0f} min\n{v[k]:,.0f} µGy/day', fontsize=8, color=INK, va='center')
b.set_yscale('log'); b.set_xlim(-10, 180); b.set_ylim(150, 20000)
b.set_xlabel('Minutes after onset'); b.set_ylabel('Dose rate (µGy/day, log scale)')
b.grid(axis='y', color=GRID, lw=0.8, which='major'); b.set_axisbelow(True)
b.legend(loc='upper right', frameon=False, fontsize=8)
b.set_title('(b) Nowcast on the May 2024 event', loc='left', fontsize=10, fontweight='bold', color=INK)
fig.tight_layout(w_pad=3)
out = ROOT / 'docs/figures/rad_model.png'
fig.savefig(out, dpi=220); print(out)
