"""Lista de planos de «El cuaderno» para MiniMax H3 (imagen inicial → imagen final, instrucción por segundos).
D = la mano dibuja (página en blanco B → página dibujada A). V = el dibujo cobra vida y se pasa la página (A → B siguiente).
python3 prompts/cuaderno_planos.py > prompts/cuaderno_planos.json"""
import json

FIJO = ("Locked-off overhead camera looking straight down, absolutely no camera movement, no zoom. "
        "Do not move the notebook, page edges or red ribbon at any point except the page that turns. "
        "ONLY ONE HAND EXISTS IN THIS SCENE: a single real right hand of a man, five natural fingers, real skin, dark blue rolled sleeve, "
        "always entering and leaving from the lower right edge. There is never a second hand, never a left hand, never two arms. "
        "Warm desk lamp light from the upper left, cool shadow lower right, fine film grain. "
        "Drawn people stay simple sketched silhouettes. Lines appear only exactly where the pencil touches; "
        "the drawing never fades in, morphs or redraws itself. No text, no letters, no extra hands or fingers. "
        "Audio: graphite scratching on thick paper, a quiet room at night. No music.")
DIBUJA = ("Photoreal vertical 9:16, {s} seconds, fast time-lapse of one hand drawing, from the blank pages of the first frame, where there is no hand, "
          "to the finished drawing of the last frame. The single hand enters from the lower right edge holding a graphite pencil and draws. "
          "The artist's left hand rests in his lap, completely outside the frame for the whole shot: the left side and the bottom-left "
          "corner of the paper always stay empty of any hand. ")
VIVE = "Photoreal vertical 9:16, {s} seconds, the pencil drawing on the open sketchbook comes alive while the paper stays real paper; the animation stays inside the drawn lines. "
GIRO = ("the same single hand lays the pencil aside, lifts the lower edge of the bottom page and turns it over the spine toward the top, a real paper "
        "page turning with its weight and soft curl, and then the hand leaves the frame to the lower right, revealing fresh blank pages with no hand, "
        "exactly as in the last frame")

P = [
 # (id, inicio, final, segundos, texto)
 ("V00", "A00", "B01", 7, VIVE + "[0 to 3 seconds] The small gold flame flickers, weakens and almost goes out; the hand cups around it protectively and it glows again. [3 to 7 seconds] Then " + GIRO + "."),
 ("D01", "B01", "A01", 6, DIBUJA + "[0 to 2 seconds] The horizon line and the night sky with clouds on the top page. [2 to 4 seconds] The long road comes toward us in perspective across the spine, then the roadside poles. [4 to 6 seconds] The lone man seen from behind, walking on the road, and the hand settles into the pose of the last frame."),
 ("V01", "A01", "B02", 6, VIVE + "[0 to 3 seconds] The drawn man walks slowly forward along the drawn road, the clouds drift. [3 to 6 seconds] Then " + GIRO + "."),
 ("D02", "B02", "A02", 6, DIBUJA + "[0 to 2 seconds] The mountains on the top page. [2 to 4 seconds] The winding river flowing down across the spine, then the two hands holding the pan. [4 to 6 seconds] A brush dabs gold watercolor flakes into the pan, the humble village at the bottom, and the hand settles into the pose of the last frame."),
 ("V02", "A02", "B03", 6, VIVE + "[0 to 3 seconds] The drawn river flows, the gold flakes in the pan glint in the lamp light. [3 to 6 seconds] Then " + GIRO + "."),
 ("D03", "B03", "A03", 6, DIBUJA + "[0 to 3 seconds] The heavy excavator on the top page, then diagonal pencil rain over it. [3 to 6 seconds] The tall pile of stamped documents on the bottom page, and the hand settles into the pose of the last frame."),
 ("V03", "A03", "B04", 6, VIVE + "[0 to 3 seconds] Drawn rain keeps falling in pencil strokes over the still machine, the pile of papers grows a little taller. [3 to 6 seconds] Then " + GIRO + "."),
 ("D04", "B04", "A04", 6, DIBUJA + "[0 to 3 seconds] The kitchen table, then exactly four silhouettes: father, mother, son and daughter, books and a laptop. [3 to 6 seconds] Exactly four small lights painted in gold watercolor, one in front of each person, and the hand settles into the pose of the last frame."),
 ("V04", "A04", "B05", 6, VIVE + "[0 to 3 seconds] The four gold lights brighten one by one and glow warmly. [3 to 6 seconds] Then " + GIRO + "."),
 ("D05", "B05", "A05", 8, DIBUJA + "[0 to 3 seconds] The table with the first family, then the second family arriving: a father, a mother and three children. [3 to 6 seconds] The programmer at a screen and the hands with a calculator, then many tiny figures around the edges, each with a tiny gold light. [6 to 8 seconds] The hand withdraws out of frame to the lower right; the last frame has no hand."),
 ("V05", "A05", "B06", 6, VIVE + "[0 to 3 seconds] The tiny figures gather in toward the table from the edges and their gold lights brighten. [3 to 6 seconds] Then " + GIRO + "."),
 ("D06", "B06", "A06", 8, DIBUJA + "[0 to 4 seconds] The tired table late at night: cups, calendars with crossed-out days, crumpled paper, one figure with head in hands, the supporters with heads down holding their small gold lights. [4 to 6 seconds] The hand slows and stops, trembling. [6 to 8 seconds] A single real tear drop falls from above onto the bottom page and softly blurs the graphite where it lands, as in the last frame."),
 ("V06", "A06", "B07", 7, VIVE + "[0 to 2 seconds] Silence; the small gold lights flicker weakly. [2 to 7 seconds] The single hand grips the top corner of the bottom page and tears it out with one sharp pull, crumples it into a ball in that same one hand and carries it out of frame to the lower right, revealing fresh blank pages exactly as in the last frame, with no hand."),
 ("D07", "B07", "A07", 6, DIBUJA + "[0 to 2 seconds] Many small gold lights on the top page. [2 to 4 seconds] A river of gold watercolor flowing down across the spine into a large round gold coin. [4 to 6 seconds] The small market below, one hand paying with a phone, and the hand withdraws; the last frame has no hand."),
 ("V07", "A07", "B08", 6, VIVE + "[0 to 3 seconds] The gold watercolor keeps flowing down into the coin, which shines in the lamp light. [3 to 6 seconds] Then " + GIRO + "."),
 ("D08", "B08", "A08", 6, DIBUJA + "[0 to 3 seconds] The map of Central America with dotted borders, then thin gold lines advancing from country to country. [3 to 5 seconds] The hand presses hard drawing a thick charcoal wall across the isthmus. [5 to 6 seconds] The pencil tip snaps with a crack and a tiny piece of graphite falls onto the page, as in the last frame."),
 ("V08", "A08", "B09", 6, VIVE + "[0 to 3 seconds] The gold lines pulse against the grey wall and stop there. [3 to 6 seconds] Then " + GIRO + "."),
 ("D09", "B09", "A09", 6, DIBUJA + "[0 to 3 seconds] A simple table and one empty chair facing us on the bottom page. [3 to 6 seconds] A small light in graphite in front of the chair, then the hand lays the pencil down on the page, as in the last frame."),
 ("V09", "A09", None, 7, VIVE + "[0 to 2 seconds] Stillness. [2 to 6 seconds] The hand slowly slides the pencil toward the bottom edge of the frame, toward the viewer, as if offering it. [6 to 7 seconds] The hand lifts away and the pencil rests at the edge. Nothing else moves."),
 ("D10", "B10", "A10", 7, DIBUJA + "[0 to 3 seconds] The map of Central America with dotted borders and the wall across the isthmus. [3 to 5 seconds] Gold watercolor lines connect every country into a glowing network and the wall cracks and breaks where the gold passes. [5 to 7 seconds] The small chair's light is painted gold, the hand sets the pencil aside and rests open on the page, as in the last frame."),
 ("V10", "A10", None, 8, VIVE + "[0 to 3 seconds] The gold network pulses softly and the chair's light glows warm. [3 to 7 seconds] The single hand slowly closes the notebook: the top page folds down over the bottom page and the dark worn cover settles. [7 to 8 seconds] Stillness on the closed cover under the lamp."),
]

# En V05 y V07 la página dibujada no tiene mano: entra la mano solo para pasar la página.
for i, (pid, a_, b_, seg, txt) in enumerate(P):
    if pid in ("V05", "V07"):
        P[i] = (pid, a_, b_, seg, txt.replace("Then the same single hand lays the pencil aside, lifts",
                                              "Then the single hand enters from the lower right edge, lifts"))
# V00 solo se usa desde el giro: la llamita es dibujo, no fuego.
P[0] = ("V00", "A00", "B01", 7, VIVE + "IMPORTANT: the small flame is only a drawing painted with gold watercolor flat on the paper; it is NOT real fire: no real flame, no burning, no smoke, no light rising from the page. [0 to 3 seconds] The drawn gold flame shimmers softly as the lamp light catches the gold pigment; the hand rests beside it. [3 to 7 seconds] Then " + GIRO + ".")

if __name__ == "__main__":
    print(json.dumps([{"id": i, "inicio": a, "final": b, "seg": s, "prompt": t.replace("{s}", str(s)) + " " + FIJO} for i, a, b, s, t in P], ensure_ascii=False, indent=1))
