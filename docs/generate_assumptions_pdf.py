"""Generate the 2-page assumptions and decisions PDF.

The wording is the document. Keep statements factual and short.
"""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF
from fpdf.enums import WrapMode

OUT = Path(__file__).with_name("NCRTC_BMS_Assumptions_and_Decisions.pdf")

NAVY = (11, 61, 92)
TEAL = (31, 122, 109)
GOLD = (201, 162, 39)
INK = (16, 42, 60)
MUTED = (90, 104, 116)
LINE = (214, 222, 228)
ZEBRA = (244, 248, 249)
NOTE_BG = (255, 248, 235)

SANS = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf"
SANS_SEMI = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
SERIF_B = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"

ML, MR = 12, 12
CONTENT_W = 210 - ML - MR

NAME = "Anushka Singh Rajput"
LINKEDIN = "https://www.linkedin.com/in/anushka-singh-rajput"
GITHUB = "https://github.com/AnushkaSinghRajput"
REPO = "https://github.com/AnushkaSinghRajput/ncrtc-bus-management-system"


class Doc(FPDF):
    def header(self):
        self.set_xy(ML, 7)
        self.set_font("Sans", "B", 8)
        self.set_text_color(*NAVY)
        self.cell(CONTENT_W * 0.62, 4, "NCRTC BUS MANAGEMENT SYSTEM", align="L")
        self.set_font("Sans", "", 8)
        self.set_text_color(*MUTED)
        self.cell(CONTENT_W * 0.38, 4, "ADD-01   ·   23 October 2026", align="R")
        self.set_draw_color(*GOLD)
        self.set_line_width(0.4)
        self.line(ML, 12.2, 210 - MR, 12.2)
        self.set_line_width(0.2)
        self.set_y(15)

    def footer(self):
        self.set_y(-11)
        self.set_draw_color(*LINE)
        self.set_line_width(0.2)
        self.line(ML, self.get_y(), 210 - MR, self.get_y())
        self.set_y(-9.2)
        self.set_font("Sans", "", 7.5)
        self.set_text_color(*NAVY)
        self.cell(42, 4, NAME, align="L")
        self.set_text_color(*TEAL)
        self.cell(28, 4, "LinkedIn", align="L", link=LINKEDIN)
        self.cell(24, 4, "GitHub", align="L", link=GITHUB)
        self.cell(70, 4, "Project repository", align="L", link=REPO)
        self.set_text_color(*MUTED)
        self.cell(CONTENT_W - 164, 4, f"{self.page_no()}  /  {{nb}}", align="R")


class Writer:
    def __init__(self, pdf: Doc):
        self.pdf = pdf

    def gap(self, h: float):
        self.pdf.ln(h)

    def h1(self, text: str):
        self.gap(2.2)
        self.pdf.set_font("Sans", "B", 11)
        self.pdf.set_text_color(*NAVY)
        self.pdf.cell(CONTENT_W, 5, text, new_x="LMARGIN", new_y="NEXT")
        self.gap(1.0)

    def p(self, text: str, size: float = 8.5, gap: float = 1.4):
        self.pdf.set_font("Sans", "", size)
        self.pdf.set_text_color(*INK)
        self.pdf.multi_cell(CONTENT_W, 3.8, text, wrapmode=WrapMode.WORD)
        self.gap(gap)

    def note(self, text: str):
        pad_x, pad_y = 3.0, 2.0
        inner = CONTENT_W - 2 * pad_x - 1.2
        self.pdf.set_font("Sans", "", 8.5)
        th = self.pdf.multi_cell(inner, 3.8, text, dry_run=True, output="HEIGHT", wrapmode=WrapMode.WORD)
        h = th + 2 * pad_y
        y = self.pdf.get_y()
        self.pdf.set_fill_color(*NOTE_BG)
        self.pdf.rect(ML, y, CONTENT_W, h, "F")
        self.pdf.set_fill_color(*GOLD)
        self.pdf.rect(ML, y, 1.2, h, "F")
        self.pdf.set_xy(ML + pad_x + 1.0, y + pad_y)
        self.pdf.set_text_color(*INK)
        self.pdf.multi_cell(inner, 3.8, text, wrapmode=WrapMode.WORD)
        self.pdf.set_y(y + h + 1.6)

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float], size: float = 7.6):
        line_h = 3.7
        pad_x, pad_y = 1.5, 1.7

        def row_h(cells: list[str], header: bool) -> float:
            self.pdf.set_font("Sans", "B" if header else "", 7.4 if header else size)
            tallest = 0.0
            for text, w in zip(cells, widths):
                th = self.pdf.multi_cell(
                    w - 2 * pad_x, line_h, text, dry_run=True, output="HEIGHT", wrapmode=WrapMode.WORD
                )
                tallest = max(tallest, th)
            return tallest + 2 * pad_y

        def paint(cells: list[str], header: bool, fill):
            h = row_h(cells, header)
            if self.pdf.get_y() + h > self.pdf.h - 13:
                self.pdf.add_page()
                if headers and not header:
                    paint(headers, True, NAVY)
            y = self.pdf.get_y()
            self.pdf.set_fill_color(*fill)
            self.pdf.rect(ML, y, CONTENT_W, h, "F")
            self.pdf.set_draw_color(*LINE)
            self.pdf.line(ML, y + h, ML + CONTENT_W, y + h)
            self.pdf.set_text_color(*(255, 255, 255) if header else INK)
            self.pdf.set_font("Sans", "B" if header else "", 7.4 if header else size)
            x = ML
            for text, w in zip(cells, widths):
                self.pdf.set_xy(x + pad_x, y + pad_y)
                self.pdf.multi_cell(w - 2 * pad_x, line_h, text, wrapmode=WrapMode.WORD)
                x += w
            self.pdf.set_y(y + h)

        paint(headers, True, NAVY)
        for i, row in enumerate(rows):
            paint(row, False, ZEBRA if i % 2 == 0 else (255, 255, 255))
        self.gap(1.2)


def link_line(pdf: Doc, label: str, url: str):
    pdf.set_font("Sans", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(24, 4.2, label, align="L")
    pdf.set_font("Sans", "", 8)
    pdf.set_text_color(*TEAL)
    pdf.cell(CONTENT_W - 24, 4.2, url, align="L", link=url, new_x="LMARGIN", new_y="NEXT")


def build() -> Doc:
    pdf = Doc(format="A4", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=13)
    pdf.set_title("NCRTC BMS — Additional Assumptions and Decisions")
    pdf.set_author(NAME)
    pdf.set_subject("ADD-01, 23 October 2026. As built.")
    pdf.set_creator(NAME)
    pdf.add_font("Sans", "", SANS)
    pdf.add_font("Sans", "B", SANS_SEMI)
    pdf.add_font("Serif", "B", SERIF_B)
    pdf.alias_nb_pages()
    pdf.add_page()
    w = Writer(pdf)

    pdf.set_font("Sans", "B", 8)
    pdf.set_text_color(*TEAL)
    pdf.cell(CONTENT_W, 3.6, "PROJECT RECORD", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Serif", "B", 16)
    pdf.set_text_color(*NAVY)
    pdf.cell(CONTENT_W, 7, "Additional assumptions and decisions", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Sans", "", 9)
    pdf.set_text_color(*INK)
    pdf.cell(CONTENT_W, 4.2, "NCRTC Bus Management System  —  student build, as it stands in the repository.", new_x="LMARGIN", new_y="NEXT")
    w.gap(1.2)

    pdf.set_font("Sans", "B", 9)
    pdf.set_text_color(*NAVY)
    pdf.cell(CONTENT_W, 4.4, NAME, new_x="LMARGIN", new_y="NEXT")
    link_line(pdf, "LinkedIn", LINKEDIN)
    link_line(pdf, "GitHub", GITHUB)
    link_line(pdf, "Repository", REPO)
    w.gap(1.6)

    w.note(
        "Bus positions in this project are simulated. A script inserts GPS rows. There is no GPS device and no connection "
        "to NCRTC operations. This note records assumptions, choices, and items from the Student Project Brief (Lite) v1.0 "
        "that are not in the repository. It does not replace the brief, the README, or ARCHITECTURE.md."
    )

    w.h1("1.  Assumptions")
    w.table(
        ["No.", "Assumption", "What follows"],
        [
            ["A1", "Operational data is dummy data from a seed script.", "Not live NCRTC records. Names come from a name library with a fixed seed."],
            ["A2", "There is no GPS hardware and no NCRTC feed.", "A position exists only because our code inserted a row. See D2."],
            ["A3", "A duty is one driver, one vehicle, one route, one date, one start and one end.", "The brief's table has a single route. Several trips on one duty are not stored."],
            ["A4", "Depot managers, drivers and conductors see only their depot.", "Admin and control room see every depot. Their accounts have no depot."],
            ["A5", "A bus with a published or acknowledged duty today is expected to be out, not in the depot.", "Those buses are not geofence breaches. See D8."],
            ["A6", "The demo password is shared and is not a secret.", "Every seeded account uses \"password\". Demo only."],
            ["A7", "Map and admin screens are for a laptop. The driver screen is for a phone.", "Phone layout is the /driver route only."],
            ["A8", "Demo size is about 50 vehicles and 80 users. The brief also mentions 500 vehicles.", "The seed is 50 and 80. A test at 500 vehicles has not been run."],
            ["A9", "Notices are in English.", "Hindi is a stretch item in the brief. There is no second language field."],
        ],
        [12, 92, CONTENT_W - 104],
        size=7.5,
    )

    w.h1("2.  Decisions")
    w.p("Each row is the choice and the limit that comes with it. The limit is what that choice does not cover.", size=8, gap=1.0)
    w.table(
        ["No.", "Choice", "Limit"],
        [
            ["D1", "Stack from the brief: FastAPI, PostgreSQL 16 with PostGIS, React, Vite, TypeScript, Tailwind, Leaflet. Docker Compose runs database, API, GPS tick, and web app.", "No Redis, no message queue, no native mobile app. The driver app is a route in the same site."],
            ["D2", "A tick script inserts a GPS row about every 7 seconds. The map polls every 5 seconds.", "Points step toward the next stop. They do not follow roads. Stored speed is a random number, not distance over time. No WebSocket."],
            ["D3", "Passwords are bcrypt hashes. Login returns a JWT (HS256, 480 minutes) stored in localStorage.", "A script on the page can read that token. Fine for this demo, not a production session. Photos at /uploads have no login check."],
            ["D4", "Roles: driver, conductor, depot_manager, control_room_operator, admin. The brief's name for the control-room job is control_operator.", "The executive read-only role is not built. Only a driver can acknowledge a duty. Driver and conductor can both use panic."],
            ["D5", "The eleven tables in the brief. The depot outline is GeoJSON in a JSON column, checked with PostGIS on each request.", "No spatial index. Each outline is a square of about 0.9 km around an approximate point, not a surveyed boundary."],
            ["D6", "Alembic revision 001 creates the tables. Startup also calls create_all, and seeds only if the user table is empty.", "An existing database is not altered by a later model change unless a new revision is written and run."],
            ["D7", "Seed: 5 depots (Noida Sector 37, Anand Vihar, Ghaziabad, Sahibabad, Duhai); 50 vehicles (42 active, 5 idle, 3 in maintenance); 80 users (1 admin, 2 control room, 5 managers, 50 drivers, 22 conductors); 12 routes; one week of duties; 6 incidents; 3 notices.", "Yesterday's trail is 12 vehicles, 40 points, three minutes apart, interpolated between stops. Not a recording from a road."],
            ["D8", "Geofence list: latest ping under 10 minutes old, outside the depot square, and no published or acknowledged duty today. Distance is from the depot centre. Depot managers see only their depot.", "The result is not stored and cannot be closed. A bus silent for more than 10 minutes drops off the list."],
            ["D9", "Live marker colour is motion: moving above 1 km/h, otherwise stopped, grey if the last ping is over 2 minutes old.", "On-time and late are not calculated. The brief's stretch colours are not implemented."],
            ["D10", "History replay: play, pause, and speeds of 1, 5 and 20 times, plus path length, duration, average speed and top speed.", "Length is straight lines between pings. Speeds are the stored numbers, which were assigned, not measured."],
            ["D11", "A duty is draft, then published, then acknowledged by the driver, with a time stored. Copy-week copies a week as drafts and skips a driver already rostered that day.", "The clash check is the driver only. The same vehicle can appear twice in a day. The screen creates and deletes routes; it has no edit form. Leave requests are not built."],
            ["D12", "Panic creates a P1 and, when today's duty has a vehicle, copies that bus's latest stored ping onto the incident.", "That ping can be minutes old. The phone does not send its own location. Photos sit on a Docker volume."],
            ["D13", "SLA clocks run in the browser, from the time the incident was raised. Open: time to acknowledge. After that: time to resolve. Targets used: P1 15 min / 4 h, P2 1 h / 24 h, P3 4 h / 72 h.", "The brief suggested one clock: P1 1 hour, P2 4 hours, P3 24 hours. We did not use those numbers. The API does not store or enforce a due time, and it notifies nobody."],
            ["D14", "A notice goes to everyone, all drivers and conductors, one role, or one depot. Managers can list every targeted user, including people with no read row.", "Body is plain text. No Hindi and no PDF attachment."],
            ["D15", "An admin can add a vehicle, create a user, and deactivate an account. A driver, conductor or depot manager must have a depot. Only an admin can move a bus between depots.", "An admin cannot deactivate their own account. There is no password reset and no screen to edit a depot."],
            ["D16", "20 API tests run against a seeded stack. 12 frontend tests run without it.", "No GitHub Actions workflow in the repository. No test at 500 vehicles."],
        ],
        [12, 96, CONTENT_W - 108],
        size=7.4,
    )

    w.h1("3.  Not built")
    w.p(
        "Executive read-only role and a report PDF. WebSocket live updates. On-time and late marker colours. "
        "Leave requests. Hindi notice text. A PDF attached to a notice. A stored geofence event someone can close. "
        "A server-side SLA check or a breach notification. GitHub Actions. GPS ingest from a device. A test at 500 vehicles.",
        size=8,
        gap=1.4,
    )
    pdf.set_font("Sans", "", 8)
    pdf.set_text_color(*INK)
    pdf.cell(
        CONTENT_W,
        4,
        "Version 1.0, 23 October 2026. Prepared by Anushka Singh Rajput for team-leader review.",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    w.gap(1.2)
    link_line(pdf, "LinkedIn", LINKEDIN)
    link_line(pdf, "GitHub", GITHUB)
    link_line(pdf, "Repository", REPO)
    return pdf


if __name__ == "__main__":
    doc = build()
    doc.output(str(OUT))
    if doc.pages_count != 2:
        raise SystemExit(f"expected 2 pages, got {doc.pages_count}")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {doc.pages_count} pages)")
