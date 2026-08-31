#!/usr/bin/env python3
"""Génère les icônes d'application de BrainstO. à partir d'une seule source.

    python3 tools/build-icons.py

Pourquoi un rastériseur écrit à la main plutôt qu'un outil : la règle du dépôt
interdit toute dépendance, et l'icône n'est qu'un aplat plus deux cercles. Ce
fichier n'utilise que la bibliothèque standard (`zlib`, `struct`) et produit du
PNG 8 bits RVB.

CE QUE CE SCRIPT ÉVITE, ET C'EST SA RAISON D'ÊTRE.
L'écran de démarrage d'une application installée est composé par le système :
il peint le `background_color` du manifeste, puis pose l'icône par-dessus.
Si le fond de l'icône n'est pas EXACTEMENT `background_color`, un disque plus
clair ou plus sombre se découpe au milieu de l'écran. C'est arrivé — fond
`#031C25`, icône `#01161E` — et cela ne se voit sur aucune maquette : il faut
installer l'application pour l'observer.

La constante FOND ci-dessous doit donc rester synchronisée avec
`background_color` de `manifest.webmanifest`. C'est le seul couplage du
fichier, et il est vérifié à l'exécution : le script refuse de générer si les
deux valeurs divergent.
"""

import json
import os
import re
import struct
import sys
import zlib

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ----------------------------------------------------------------- Palette ---

FOND = (0x0F, 0x0D, 0x0B)      # = manifest background_color, vérifié plus bas
ANNEAU = (0xEE, 0xEA, 0xE3)    # --n-900 du thème sombre
POINT = (0x8F, 0xB2, 0xF2)     # --accord du thème sombre

# ---------------------------------------------------------------- Géométrie --
# Exprimée dans le repère 0–100 de assets/icons/icon.svg, dont ce script est la
# transcription. Toute modification doit être reportée dans les deux.

ANNEAU_CX, ANNEAU_CY, ANNEAU_R, ANNEAU_TRAIT = 43.5, 50.0, 19.44, 9.12
POINT_CX, POINT_CY, POINT_R = 81.78, 67.2, 6.8

# Suréchantillonnage : chaque pixel est évalué SS×SS fois puis moyenné. C'est
# tout l'anticrénelage du script — sans lui, un cercle de 512 px montre des
# marches d'escalier parfaitement visibles sur un écran de téléphone.
SS = 4


def dessiner(taille, echelle=1.0):
    """Rend l'icône en `taille`×`taille` pixels.

    `echelle` réduit la marque autour du centre de l'image sans toucher au
    fond : c'est ce qui produit la variante maskable, dont le contenu doit
    tenir dans le cercle de sûreté (80 % du côté) que les lanceurs Android
    découpent — un logo rendu pleine largeur y perd ses bords.
    """
    r_ext = ANNEAU_R + ANNEAU_TRAIT / 2.0
    r_int = ANNEAU_R - ANNEAU_TRAIT / 2.0
    px = bytearray()

    for y in range(taille):
        ligne = bytearray()
        for x in range(taille):
            acc_a = acc_p = 0
            for sy in range(SS):
                for sx in range(SS):
                    # Centre du sous-pixel, ramené dans le repère 0–100.
                    u = (x + (sx + 0.5) / SS) / taille * 100.0
                    v = (y + (sy + 0.5) / SS) / taille * 100.0
                    # Réduction homothétique autour du centre de l'image.
                    u = 50.0 + (u - 50.0) / echelle
                    v = 50.0 + (v - 50.0) / echelle

                    du, dv = u - ANNEAU_CX, v - ANNEAU_CY
                    d = (du * du + dv * dv) ** 0.5
                    if r_int <= d <= r_ext:
                        acc_a += 1
                    du, dv = u - POINT_CX, v - POINT_CY
                    if (du * du + dv * dv) ** 0.5 <= POINT_R:
                        acc_p += 1

            n = float(SS * SS)
            a, p = acc_a / n, acc_p / n
            # Le point est peint par-dessus l'anneau ; les deux ne se
            # chevauchent pas, mais l'ordre reste celui du SVG.
            for i in range(3):
                c = FOND[i] * (1 - a) + ANNEAU[i] * a
                c = c * (1 - p) + POINT[i] * p
                ligne.append(int(round(c)))
        px += b"\x00" + bytes(ligne)   # octet de filtre « None » par ligne
    return bytes(px)


def ecrire_png(chemin, taille, brut):
    def bloc(typ, data):
        return (struct.pack(">I", len(data)) + typ + data
                + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", taille, taille, 8, 2, 0, 0, 0)
    donnees = (b"\x89PNG\r\n\x1a\n"
               + bloc(b"IHDR", ihdr)
               + bloc(b"IDAT", zlib.compress(brut, 9))
               + bloc(b"IEND", b""))
    with open(chemin, "wb") as f:
        f.write(donnees)
    return len(donnees)


def hexa(rvb):
    return "#%02x%02x%02x" % rvb


def verifier_manifeste():
    """Le fond de l'icône DOIT être celui du manifeste — c'est tout l'objet."""
    chemin = os.path.join(RACINE, "manifest.webmanifest")
    with open(chemin, encoding="utf-8") as f:
        manifeste = json.load(f)
    attendu = manifeste.get("background_color", "").lower()
    if attendu != hexa(FOND):
        sys.exit(
            "ARRÊT — le fond de l'icône et le manifeste divergent :\n"
            "  manifest.webmanifest background_color = %s\n"
            "  tools/build-icons.py FOND             = %s\n"
            "Un écart, même d'une unité, dessine un disque visible au centre "
            "de l'écran de démarrage. Alignez les deux, puis relancez."
            % (attendu or "(absent)", hexa(FOND)))


def main():
    verifier_manifeste()
    icones = os.path.join(RACINE, "assets", "icons")

    # Le SVG est la source lisible ; il est réécrit pour ne jamais diverger des
    # PNG. C'est lui que sert le navigateur (favicon), eux que sert le système.
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
        'width="100" height="100" role="img" aria-label="BrainstO.">\n'
        '  <rect width="100" height="100" fill="%s"/>\n'
        '  <circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-width="%s"/>\n'
        '  <circle cx="%s" cy="%s" r="%s" fill="%s"/>\n'
        '</svg>\n' % (hexa(FOND), ANNEAU_CX, ANNEAU_CY, ANNEAU_R, hexa(ANNEAU),
                      ANNEAU_TRAIT, POINT_CX, POINT_CY, POINT_R, hexa(POINT))
    )
    with open(os.path.join(icones, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    print("  icon.svg                  réécrit")

    # 0.62 pour la variante maskable : la marque déborde à droite (le point est
    # à x=88,6 sur 100), donc la contrainte n'est pas le côté de l'image mais
    # le rayon du cercle de sûreté. 0,62 laisse le point à l'intérieur avec de
    # la marge, y compris sur les découpes les plus agressives.
    for nom, taille, echelle in [("icon-192.png", 192, 1.0),
                                 ("icon-512.png", 512, 1.0),
                                 ("icon-maskable-512.png", 512, 0.62)]:
        chemin = os.path.join(icones, nom)
        poids = ecrire_png(chemin, taille, dessiner(taille, echelle))
        print("  %-25s %d×%d, échelle %.2f, %d octets"
              % (nom, taille, taille, echelle, poids))

    print("\nFond des icônes : %s — identique à background_color." % hexa(FOND))
    print("L'écran de démarrage ne montre donc plus aucune démarcation.")


if __name__ == "__main__":
    main()
