#!/usr/bin/env python3
"""Vérifie au ratio tous les couples de couleurs du thème de BrainstO.

    python3 tools/check-contrast.py

Pourquoi ce script existe. L'en-tête de `css/app.css` affirme depuis longtemps
que « tous les couples ont été vérifiés au ratio, dans les deux modes ». Tant
que cette phrase reposait sur une relecture à l'œil, elle vieillissait à chaque
modification de jeton : une valeur retouchée pour des raisons esthétiques peut
faire passer un couple sous le seuil sans que rien ne le signale, et le défaut
se découvre en production, sur le téléphone de quelqu'un, en plein jour.

Ce fichier lit les jetons de `css/app.css` — il ne les recopie pas, sans quoi
il y aurait deux vérités — résout les `var(--…)` et les `rgba()` posés sur leur
fond réel, et échoue si un seul couple tombe sous son seuil.

Les seuils sont ceux de WCAG 2.2 :
  4,5:1  texte courant (SC 1.4.3)
  3,0:1  composants d'interface et objets graphiques (SC 1.4.11)

Bibliothèque standard uniquement : la règle du dépôt interdit toute dépendance.
"""

import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEUILLE = os.path.join(RACINE, "css", "app.css")

TEXTE = 4.5
COMPOSANT = 3.0

# Chaque couple : (encre, fond, seuil, libellé).
# Le fond peut être un empilement : ("--accord-bg", "--surface") se lit « le
# jeton pâle POSÉ SUR la surface », ce qui est la seule façon correcte de
# mesurer un rgba() — en mode sombre, la moitié des fonds pâles en sont.
COUPLES = [
    # --- Texte sur les cinq fonds où il apparaît réellement ----------------
    ("--text", "--canvas", TEXTE, "texte courant sur le fond"),
    ("--text", "--surface", TEXTE, "texte courant sur une surface"),
    ("--text", "--surface-sunken", TEXTE, "texte courant sur un creux"),
    ("--text", "--surface-sheet", TEXTE, "texte courant sur une feuille"),
    ("--text", "--surface-strong", TEXTE, "texte courant sur une surface élevée"),
    ("--muted", "--canvas", TEXTE, "texte secondaire sur le fond"),
    ("--muted", "--surface", TEXTE, "texte secondaire sur une surface"),
    ("--muted", "--surface-sunken", TEXTE, "texte secondaire sur un creux"),
    ("--muted", "--surface-sheet", TEXTE, "texte secondaire sur une feuille"),
    # `--faint` porte les horodatages : c'est le niveau qu'on affaiblit sans y
    # penser, donc celui qu'il faut mesurer sur tous ses fonds.
    ("--faint", "--canvas", TEXTE, "horodatages sur le fond"),
    ("--faint", "--surface", TEXTE, "horodatages sur une surface"),
    ("--faint", "--surface-sunken", TEXTE, "horodatages sur un creux"),
    ("--faint", "--surface-sheet", TEXTE, "horodatages sur une feuille"),

    # --- Encre posée sur un aplat ------------------------------------------
    ("--on-accord", "--accord-surface", TEXTE, "encre sur l'accord en aplat"),
    ("--on-accord-soft", "--accord-surface", TEXTE, "encre secondaire sur l'accord"),
    ("--on-ink", "--ink", TEXTE, "encre sur une bulle à soi"),
    ("--on-ink-soft", "--ink", TEXTE, "horodatage d'une bulle à soi"),
    ("--on-danger", "--danger", TEXTE, "encre sur une action destructive"),
    ("--on-voix", "--voix-strong", TEXTE, "encre sur un « contre » exprimé"),
    ("--text", "--n-200", TEXTE, "encre sur une abstention exprimée"),

    # --- Pastilles : la couleur saturée sur son propre fond pâle -----------
    ("--accord", ("--accord-bg", "--surface"), TEXTE, "pastille « accord »"),
    ("--voix", ("--voix-bg", "--surface"), TEXTE, "pastille « en débat »"),
    ("--success", ("--success-bg", "--surface"), TEXTE, "pastille de succès"),
    ("--danger", ("--danger-bg", "--surface"), TEXTE, "pastille d'erreur"),
    ("--warning", ("--warning-bg", "--surface"), TEXTE, "pastille d'avertissement"),
    ("--info", ("--info-bg", "--surface"), TEXTE, "pastille d'information"),

    # --- Composants d'interface : le seuil qu'on oublie --------------------
    ("--line-field", "--surface", COMPOSANT, "bord de champ sur une surface"),
    ("--line-field", "--canvas", COMPOSANT, "bord de champ sur le fond"),
    ("--line-field", "--surface-sunken", COMPOSANT, "bord de champ sur un creux"),
    ("--line-field", "--surface-sheet", COMPOSANT, "bord de champ sur une feuille"),
    ("--accord", "--surface", COMPOSANT, "contour de focus sur une surface"),
    ("--accord", "--canvas", COMPOSANT, "contour de focus sur le fond"),
    ("--accord", "--surface-sheet", COMPOSANT, "contour de focus sur une feuille"),

    # --- Barre de vote : la surface où la divergence est une donnée --------
    # Les trois segments se mesurent sur le fond de la barre, pas sur la carte.
    ("--vote-accord", ("--neutral-bg", "--surface"), COMPOSANT, "segment « pour »"),
    ("--vote-voix", ("--neutral-bg", "--surface"), COMPOSANT, "segment « contre »"),
    ("--vote-abstention", ("--neutral-bg", "--surface"), COMPOSANT, "segment « abstention »"),

    # --- Pastilles d'état de synchronisation -------------------------------
    ("--success", "--surface", COMPOSANT, "pastille « à jour »"),
    ("--warning", "--surface", COMPOSANT, "pastille « en cours »"),
    ("--danger", "--surface", COMPOSANT, "pastille « en erreur »"),
    ("--faint", "--surface", COMPOSANT, "pastille « local »"),
]


# ------------------------------------------------------------- Lecture CSS --

def _bloc_racine(css, depuis=0):
    """Renvoie le corps du premier `:root {` rencontré à partir de `depuis`."""
    debut = css.index(":root", depuis)
    ouvrante = css.index("{", debut)
    profondeur, i = 1, ouvrante + 1
    while profondeur:
        if css[i] == "{":
            profondeur += 1
        elif css[i] == "}":
            profondeur -= 1
        i += 1
    return css[ouvrante + 1:i - 1]


def _jetons(corps):
    return dict(re.findall(r"(--[a-z0-9-]+)\s*:\s*([^;]+);", corps))


def lire_themes(chemin):
    """Renvoie (clair, sombre). Le sombre est le clair surchargé par le média."""
    css = open(chemin, encoding="utf-8").read()
    clair = _jetons(_bloc_racine(css))
    media = css.index("@media (prefers-color-scheme: dark)")
    sombre = dict(clair)
    sombre.update(_jetons(_bloc_racine(css, media)))
    return clair, sombre


# --------------------------------------------------------------- Couleurs --

def resoudre(jetons, valeur, vus=None):
    """Déplie les `var(--…)` jusqu'à une valeur littérale."""
    vus = vus or set()
    valeur = valeur.strip()
    ref = re.fullmatch(r"var\((--[a-z0-9-]+)\)", valeur)
    if not ref:
        return valeur
    nom = ref.group(1)
    if nom in vus:
        raise ValueError("cycle de jetons sur %s" % nom)
    vus.add(nom)
    return resoudre(jetons, jetons[nom], vus)


def rvba(valeur):
    """Rend (r, v, b, a) à partir de `#rrggbb` ou `rgba(r, v, b, a)`."""
    if valeur.startswith("#"):
        h = valeur[1:]
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
    m = re.fullmatch(r"rgba?\(([^)]+)\)", valeur)
    if not m:
        raise ValueError("couleur illisible : %s" % valeur)
    parts = [p.strip() for p in m.group(1).split(",")]
    a = float(parts[3]) if len(parts) > 3 else 1.0
    return (int(parts[0]), int(parts[1]), int(parts[2]), a)


def poser(dessus, dessous):
    """Compose `dessus` (éventuellement translucide) sur `dessous` opaque."""
    r1, v1, b1, a = dessus
    r2, v2, b2, _ = dessous
    return (r1 * a + r2 * (1 - a), v1 * a + v2 * (1 - a), b1 * a + b2 * (1 - a), 1.0)


def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(couleur):
    r, v, b, _ = couleur
    return 0.2126 * _lin(r) + 0.7152 * _lin(v) + 0.0722 * _lin(b)


def ratio(encre, fond):
    la, lb = luminance(encre), luminance(fond)
    haut, bas = max(la, lb), min(la, lb)
    return (haut + 0.05) / (bas + 0.05)


def couleur_de(jetons, spec):
    """Résout un jeton, ou un empilement (jeton, fond) pour les rgba()."""
    if isinstance(spec, tuple):
        dessus = rvba(resoudre(jetons, jetons[spec[0]]))
        return poser(dessus, couleur_de(jetons, spec[1]))
    valeur = rvba(resoudre(jetons, jetons[spec]))
    if valeur[3] < 1.0:
        raise ValueError(
            "%s est translucide : déclarer son fond dans COUPLES, "
            "sous la forme (\"%s\", \"--surface\")." % (spec, spec))
    return valeur


def nom(spec):
    return spec if isinstance(spec, str) else "%s sur %s" % (spec[0], spec[1])


# ------------------------------------------------------------- Exécution ----

def controler(mode, jetons):
    echecs = []
    print("  %s" % mode)
    for encre, fond, seuil, libelle in COUPLES:
        r = ratio(couleur_de(jetons, encre), couleur_de(jetons, fond))
        ok = r >= seuil
        print("    %-6s %5.2f:1  (seuil %.1f)  %s" % ("ok" if ok else "ÉCHEC", r, seuil, libelle))
        if not ok:
            echecs.append("%s — %s sur %s : %.2f:1, seuil %.1f"
                          % (libelle, nom(encre), nom(fond), r, seuil))
    return echecs


def main():
    clair, sombre = lire_themes(FEUILLE)
    print("Contrastes du thème — css/app.css, %d couples par mode\n" % len(COUPLES))
    echecs = controler("Mode clair", clair) + controler("Mode sombre", sombre)
    print()
    if echecs:
        print("%d couple(s) sous le seuil :" % len(echecs))
        for e in echecs:
            print("  - %s" % e)
        print("\nUn écart qui échoue au contraste se corrige en gardant "
              "l'intention et en changeant la valeur.")
        return 1
    print("Les %d couples tiennent leur seuil dans les deux modes." % (2 * len(COUPLES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
