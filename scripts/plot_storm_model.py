# Figure 1 in docs/RESEARCH.md: storm-model fit to dated observations, and warning time vs station distance.
import math, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
R=3389.5; SOL=88775
def gc(a,b):
    la1,lo1,la2,lo2=map(math.radians,(a[0],a[1],b[0],b[1]))
    h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(min(1,math.sqrt(h)))
kms=lambda v: v*SOL/1000   # km per sol
INK='#0b0b0b'; INK2='#52514e'; GRID='#e4e3df'; SURF='#fcfcfb'
B1='#2a78d6'; B2='#eb6834'; B3='#1baf7a'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.edgecolor':INK2,'axes.labelcolor':INK,'xtick.color':INK2,'ytick.color':INK2,
  'axes.spines.top':False,'axes.spines.right':False,'axes.linewidth':0.8,'figure.facecolor':SURF,'axes.facecolor':SURF})
fig,(a,b)=plt.subplots(1,2,figsize=(10,4.1),gridspec_kw={'width_ratios':[1.25,1]})
# (a)
o18=(31.7,342)
obs18=[('Opportunity, Meridiani',(-1.95,354.47),(2,6)),('Dust at 55°S',(-55,342),(8,9.5)),('Curiosity, Gale (τ > 8)',(-4.59,137.44),(14,18.5)),('Planet-encircling',(-31.7,162),(18,21))]
o22=(-30,107)
obs22=[('Perseverance, Jezero',(18.44,77.45),(3.5,5))]
t=[i*0.1 for i in range(0,231)]
for v,ls in [(5,(0,(2,2))),(40,(0,(2,2)))]:
    a.plot(t,[min(math.pi*R,kms(v)*x) for x in t],color='#b9b8b2',lw=1,ls=ls,zorder=1)
a.text(21.6,kms(5)*21.6+250,'5 m/s',color=INK2,fontsize=8,ha='right')
a.text(2.2,10200,'40 m/s',color=INK2,fontsize=8)
a.text(5.6,10200,'measured range, 2018',color=INK2,fontsize=8)
a.plot(t,[min(math.pi*R,kms(6.2)*x) for x in t],color=B1,lw=2,zorder=3,label='2018 storm, fitted 6.2 m/s')
a.plot([x for x in t if x<=8],[min(3600,kms(9.5)*x) for x in t if x<=8],color=B2,lw=2,zorder=3,label='2022 storm, fitted 9.5 m/s')
def obs(ax,lst,o,col):
    for name,p,(t0,t1) in lst:
        d=gc(o,p); ax.plot([t0,t1],[d,d],color=col,lw=5,solid_capstyle='round',alpha=0.35,zorder=2)
        ax.plot([t0,t1],[d,d],'|',color=INK,ms=8,mew=1.2,zorder=4)
        yield name,d,t1
for name,d,t1 in obs(a,obs18,o18,B1):
    a.text(t1+0.35,d,name,va='center',fontsize=8,color=INK)
for name,d,t1 in obs(a,obs22,o22,B2):
    a.text(t1+0.35,d-180,name,va='top',fontsize=8,color=INK)
a.set_xlim(0,24); a.set_ylim(0,11200)
a.set_xlabel('Sols after the storm was first seen'); a.set_ylabel('Great-circle distance from storm origin (km)')
a.grid(axis='y',color=GRID,lw=0.8); a.set_axisbelow(True)
a.legend(loc='lower right',frameon=False,fontsize=8)
a.set_title('(a) Model arrival vs observed arrival windows',loc='left',fontsize=10,color=INK,fontweight='bold')
# (b)
d=[i for i in range(0,121)]
for v,col in [(10,B3),(25,B1),(40,B2)]:
    y=[max(0,(x*1000/v-90)/60) for x in d]
    b.plot(d,y,color=col,lw=2,label=f'{v} m/s'+(' (Jezero 2022)' if v==25 else ''))
for x,lab in [(30,'30 km'),(100,'100 km\nNASA Exploration\nZone edge')]:
    b.axvline(x,color='#b9b8b2',lw=1,ls=(0,(2,2)),zorder=0)
for x in (30,100):
    y=(x*1000/25-90)/60; b.plot([x],[y],'o',ms=7,color=B1,mec=SURF,mew=2,zorder=5)
    b.text(x+2,y,f'{y:.1f} min',va='center' if x==100 else 'bottom',fontsize=8,color=INK)
b.text(31,3,'30 km ring',fontsize=8,color=INK2); b.text(101,3,'100 km ring',fontsize=8,color=INK2)
b.set_xlim(0,120); b.set_ylim(0,180)
b.set_xlabel('Distance from first upwind station to crew (km)'); b.set_ylabel('Warning time (min)')
b.grid(axis='y',color=GRID,lw=0.8); b.set_axisbelow(True)
b.legend(title='Front speed',loc='upper left',frameon=False,fontsize=8,title_fontsize=8)
b.set_title('(b) Warning time = distance / speed − 90 s',loc='left',fontsize=10,color=INK,fontweight='bold')
fig.tight_layout(w_pad=3)
fig.savefig(str(__import__('pathlib').Path(__file__).resolve().parents[1]/'docs'/'figures'/'storm_model.png'),dpi=220)
print([round(gc(o18,p)) for _,p,_ in obs18], round(gc(o22,obs22[0][1])))
