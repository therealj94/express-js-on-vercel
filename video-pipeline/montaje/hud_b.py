"""Capas del anuncio B. El rótulo repetido es lo que sostiene el bucle
ahora que los encuadres no son idénticos: la misma cartela, la misma
posición, tres veces, con las horas subiendo y el resultado sin cambiar."""
from PIL import Image, ImageDraw, ImageFont
W, H = 720, 1280
ORO, BLANCO, ROJO = (212,162,76), (245,242,236), (200,80,90)
R="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
M="/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
f=lambda r,t: ImageFont.truetype(r,t)

def cartela(titulo, valor, estado=None, color=None):
    im=Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle((140,46,580,120),16,fill=(0,0,0,165))
    d.text((166,60), titulo, font=f(R,21), fill=BLANCO+(195,))
    ft=f(M,38); an=d.textlength(valor,font=ft)
    d.text((556-an,56), valor, font=ft, fill=(color or ORO)+(255,))
    if estado:
        d.rounded_rectangle((140,132,398,178),12,fill=(0,0,0,150))
        d.text((158,143), estado, font=f(M,22), fill=(ROJO if estado=="SIN RESOLVER" else ORO)+(230,))
    return im

def cierre(logo="og.png"):
    im=Image.new("RGBA",(W,H),(11,10,8,255)); d=ImageDraw.Draw(im)
    lg=Image.open(logo).convert("RGBA"); lg.thumbnail((380,380))
    im.alpha_composite(lg,((W-lg.width)//2,400))
    d.line((250,690,470,690),fill=ORO+(70,),width=1)
    fm=f(M,27)
    for y,t,c in ((734,"9 HORAS",BLANCO),(782,"40 SEGUNDOS",ORO)):
        d.text(((W-d.textlength(t,font=fm))/2,y),t,font=fm,fill=c)
    return im

CAPAS = {
 "01": ("TIEMPO EN LA FILA","3 h",None,None),
 "02": ("TIEMPO EN LA FILA","3 h",None,None),
 "03": ("TIEMPO EN LA FILA","3 h","SIN RESOLVER",ROJO),
 "04": ("TIEMPO EN LA FILA","6 h",None,None),
 "05": ("TIEMPO EN LA FILA","6 h",None,None),
 "06": ("TIEMPO EN LA FILA","6 h","SIN RESOLVER",ROJO),
 "07": ("TIEMPO EN LA FILA","9 h",None,None),
 "08": ("TIEMPO EN LA FILA","9 h",None,None),
 "09": ("TIEMPO EN LA FILA","9 h","SIN RESOLVER",ROJO),
 "10": ("TIEMPO EN LA FILA","9 h",None,None),
 "11": ("TIEMPO","40 s","RESUELTO",None),
 "12": ("TIEMPO","40 s","RESUELTO",None),
}
if __name__=="__main__":
    for k,(t,v,e,c) in CAPAS.items():
        cartela(t,v,e,c).save(f"b_{k}.png")
    Image.new("RGBA",(W,H),(0,0,0,0)).save("b_13.png")   # el portavoz va limpio
    cierre().save("b_cierre.png")
    print("capas de B:", len(CAPAS)+2)
