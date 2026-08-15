# Fabrica el QR que los miembros escanean con Expo Go para abrir la vista
# previa de Orden Global.
#
#   python3 hacer-qr-vista-previa.py [salida.png]
#
# El QR lleva el enlace exp:// del canal 'expogo'. Se dibuja con corrección de
# error ALTA (H) a propósito: en el centro va el logotipo tapando módulos, y
# solo con ese nivel el código sobrevive al recorte. Los cuadros van en el
# verde oscuro de la casa sobre blanco —no al revés—: casi todas las cámaras
# esperan oscuro-sobre-claro y un QR invertido tarda o no lee.
import sys, os
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
PROYECTO = '3017e984-a8ac-479c-8b75-33f8b8e69b25'
ENLACE = (f'exp://u.expo.dev/{PROYECTO}'
          '?channel-name=expogo&runtime-version=exposdk:54.0.0&platform=android')

TINTA = (1, 42, 38)        # verde profundo de Orden Global
FONDO = (255, 255, 255)
ORO = (201, 169, 97)


def hacer(destino):
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H,
                       box_size=18, border=3)
    qr.add_data(ENLACE)
    qr.make(fit=True)
    img = qr.make_image(fill_color=TINTA, back_color=FONDO).convert('RGB')
    w, h = img.size

    # El logotipo va sobre una placa blanca con reborde de oro: sin la placa,
    # los cuadros oscuros de detrás lo ensucian y el lector duda.
    logo_ruta = os.path.join(AQUI, 'assets', 'og-logo.png')
    if os.path.exists(logo_ruta):
        lado = int(w * 0.22)
        placa = Image.new('RGB', (lado + 24, lado + 24), FONDO)
        marco = ImageDraw.Draw(placa)
        marco.rectangle([0, 0, lado + 23, lado + 23], outline=ORO, width=3)
        logo = Image.open(logo_ruta).convert('RGBA')
        logo.thumbnail((lado, lado), Image.LANCZOS)
        placa.paste(logo, ((placa.width - logo.width) // 2,
                           (placa.height - logo.height) // 2), logo)
        img.paste(placa, ((w - placa.width) // 2, (h - placa.height) // 2))

    # Pie con el nombre, para que la imagen suelta en un chat se explique sola.
    pie = 96
    lienzo = Image.new('RGB', (w, h + pie), FONDO)
    lienzo.paste(img, (0, 0))
    d = ImageDraw.Draw(lienzo)
    try:
        f1 = ImageFont.truetype(os.path.join(AQUI, 'assets', 'fonts', 'Cinzel-Bold.ttf'), 34)
        f2 = ImageFont.truetype(os.path.join(AQUI, 'assets', 'fonts', 'Cinzel-Bold.ttf'), 19)
    except Exception:
        f1 = f2 = ImageFont.load_default()
    t1, t2 = 'ORDEN GLOBAL', 'VISTA PREVIA  ·  ESCANEA CON EXPO GO'
    d.text(((w - d.textlength(t1, font=f1)) / 2, h + 12), t1, font=f1, fill=TINTA)
    d.text(((w - d.textlength(t2, font=f2)) / 2, h + 58), t2, font=f2, fill=ORO)

    lienzo.save(destino, 'PNG')
    return destino, lienzo.size


if __name__ == '__main__':
    salida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, 'qr-vista-previa.png')
    ruta, tam = hacer(salida)
    print(f'QR listo: {ruta}  ({tam[0]}x{tam[1]})')
    print(f'Enlace: {ENLACE}')
