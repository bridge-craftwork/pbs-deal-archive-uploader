#!/usr/bin/env python3
"""
PBN -> LIN converter for the PBS Deal Archive Uploader.

Parses PBN boards (Dealer, Vulnerable, Deal) and emits one LIN line per board:

    qx|o{n}|md|{dealer}{south},{west},{north}|sv|{vul}|rh||ah|Board {n}|pg||

Conventions (matching bridge-wrangler `to-lin` output):
- md dealer digit: 1=South, 2=West, 3=North, 4=East
- Hands listed in South, West, North order; East is omitted (BBO infers it)
- Each hand rendered as S...H...D...C... with cards in PBN (descending) order
- sv: o=None, n=NS, e=EW, b=All
"""
import re
import sys

SEATS = "NESW"  # PBN deal anchor order (clockwise)
DEALER_DIGIT = {"S": "1", "W": "2", "N": "3", "E": "4"}
VUL_CODE = {
    "NONE": "o", "-": "o", "LOVE": "o",
    "NS": "n", "EW": "e",
    "ALL": "b", "BOTH": "b",
}

TAG_RE = re.compile(r'^\[(\w+)\s+"(.*)"\]')


def parse_pbn(text):
    """Yield dicts {board, dealer, vul, deal} for each board in a PBN file."""
    boards = []
    cur = {}
    for line in text.splitlines():
        m = TAG_RE.match(line.strip())
        if not m:
            continue
        tag, value = m.group(1), m.group(2)
        if tag == "Board":
            if cur.get("deal"):
                boards.append(cur)
            cur = {"board": int(value)}
        elif tag == "Dealer":
            cur["dealer"] = value.strip().upper()
        elif tag == "Vulnerable":
            cur["vul"] = value.strip().upper()
        elif tag == "Deal":
            cur["deal"] = value.strip()
    if cur.get("deal"):
        boards.append(cur)
    return boards


def hand_to_lin(hand):
    """'A63.QJ92.AT2.A83' -> 'SA63HQJ92DAT2CA83' (void suit omitted entirely)."""
    suits = hand.split(".")
    if len(suits) != 4:
        raise ValueError(f"Bad hand: {hand!r}")
    return "".join(letter + cards for letter, cards in zip("SHDC", suits) if cards)


def deal_to_hands(deal):
    """PBN Deal string -> dict seat -> hand string, e.g. {'N': 'A63.QJ92...'}."""
    anchor, hands_part = deal.split(":", 1)
    anchor = anchor.strip().upper()
    hands = hands_part.split()
    if anchor not in SEATS or len(hands) != 4:
        raise ValueError(f"Bad deal: {deal!r}")
    start = SEATS.index(anchor)
    return {SEATS[(start + i) % 4]: hands[i] for i in range(4)}


def board_to_lin(board, number=None):
    """Convert one parsed board to a LIN line. `number` overrides board number."""
    n = number if number is not None else board["board"]
    hands = deal_to_hands(board["deal"])
    dealer = board.get("dealer", "S").upper()
    vul = VUL_CODE.get(board.get("vul", "NONE").upper(), "o")
    md = DEALER_DIGIT[dealer] + ",".join(
        hand_to_lin(hands[seat]) for seat in ("S", "W", "N")
    )
    return f"qx|o{n}|md|{md}|sv|{vul}|rh||ah|Board {n}|pg||"


def convert(pbn_text, renumber=True):
    """PBN file text -> list of LIN lines (renumbered 1..N by default)."""
    boards = parse_pbn(pbn_text)
    return [
        board_to_lin(b, i + 1 if renumber else None)
        for i, b in enumerate(boards)
    ]


def main():
    if len(sys.argv) != 3:
        print("usage: pbn_to_lin.py input.pbn output.lin", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
        lines = convert(f.read())
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{sys.argv[2]}: {len(lines)} boards")


if __name__ == "__main__":
    main()
