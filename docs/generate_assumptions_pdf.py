"""Generate docs/NCRTC_BMS_Assumptions_and_Decisions.pdf.

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
HEAD_BG = (11, 61, 92)
NOTE_BG = (255, 248, 235)
CARD = (247, 249, 251)

SANS = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf"
SANS_MED = "/usr/share/fonts/truetype/macos/Inter-Medium.ttf"
SANS_SEMI = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
SERIF_B = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"

ML, MR = 16, 16
CONTENT_W = 210 - ML - MR


class Doc(FPDF):
    def header(self):
        self.set_xy(ML, 8)
        self.set_font("Sans", "", 8)
        self.set_text_color(*NAVY)
        self.cell(CONTENT_W / 2, 4.5, "NCRTC BUS MANAGEMENT SYSTEM", align="L")
        self.set_font("Sans", "", 8)
        self.set_text_color(*MUTED)
        self.cell(CONTENT_W / 2, 4.5, "ADD-01   ·   23 October 2026", align="R")
        self.set_draw_color(*GOLD)
        self.set_line_width(0.45)
        self.line(ML, 14.2, 210 - MR, 14.2)
        self.set_line_width(0.2)
        self.set_y(18)

    def footer(self):
        self.set_y(-12)
        self.set_draw_color(*LINE)
        self.set_line_width(0.2)
        self.line(ML, self.get_y(), 210 - MR, self.get_y())
        self.set_y(-10)
        self.set_font("Sans", "", 8)
        self.set_text_color(*MUTED)
        self.cell(CONTENT_W - 24, 5, "Additional assumptions and decisions  ·  team-leader review", align="L")
        self.cell(24, 5, f"{self.page_no()}  /  {{nb}}", align="R")


def h_of(pdf: Doc, w: float, text: str, style: str, size: float, line_h: float) -> float:
    pdf.set_font("Sans", style, size)
    return pdf.multi_cell(w, line_h, text, dry_run=True, output="HEIGHT", wrapmode=WrapMode.WORD)


class Writer:
    def __init__(self, pdf: Doc):
        self.pdf = pdf

    def ensure(self, h: float):
        if self.pdf.get_y() + h > self.pdf.h - 16:
            self.pdf.add_page()

    def gap(self, h: float = 2.4):
        self.pdf.ln(h)

    def h1(self, text: str):
        self.ensure(16)
        self.gap(3)
        self.pdf.set_font("Serif", "B", 15)
        self.pdf.set_text_color(*NAVY)
        self.pdf.multi_cell(CONTENT_W, 7, text)
        self.pdf.set_draw_color(*LINE)
        y = self.pdf.get_y() + 0.6
        self.pdf.line(ML, y, ML + 28, y)
        self.pdf.set_y(y + 2.4)

    def h2(self, text: str):
        self.ensure(12)
        self.gap(1.5)
        self.pdf.set_font("Sans", "B", 11.5)
        self.pdf.set_text_color(*NAVY)
        self.pdf.multi_cell(CONTENT_W, 5.4, text)
        self.gap(0.6)

    def p(self, text: str, size: float = 10, gap: float = 2.2):
        self.pdf.set_font("Sans", "", size)
        self.pdf.set_text_color(*INK)
        self.pdf.multi_cell(CONTENT_W, 4.7, text, wrapmode=WrapMode.WORD)
        self.gap(gap)

    def bullet(self, text: str):
        self.pdf.set_font("Sans", "", 10)
        self.pdf.set_text_color(*INK)
        x = self.pdf.get_x()
        y = self.pdf.get_y()
        self.pdf.set_fill_color(*TEAL)
        self.pdf.ellipse(x + 1.2, y + 1.6, 1.3, 1.3, style="F")
        self.pdf.set_xy(x + 5, y)
        self.pdf.multi_cell(CONTENT_W - 5, 4.7, text, wrapmode=WrapMode.WORD)
        self.gap(1.1)

    def note(self, text: str):
        pad = 3.2
        inner = CONTENT_W - 2 * pad - 1.5
        self.pdf.set_font("Sans", "", 10)
        th = self.pdf.multi_cell(inner, 4.7, text, dry_run=True, output="HEIGHT", wrapmode=WrapMode.WORD)
        h = th + 2 * pad
        self.ensure(h + 2)
        y = self.pdf.get_y()
        self.pdf.set_fill_color(*NOTE_BG)
        self.pdf.rect(ML, y, CONTENT_W, h, "F")
        self.pdf.set_fill_color(*GOLD)
        self.pdf.rect(ML, y, 1.4, h, "F")
        self.pdf.set_xy(ML + pad + 1.2, y + pad)
        self.pdf.set_text_color(*INK)
        self.pdf.multi_cell(inner, 4.7, text, wrapmode=WrapMode.WORD)
        self.pdf.set_y(y + h + 3.5)

    def table(self, headers: list[str] | None, rows: list[list[str]], widths: list[float]):
        assert abs(sum(widths) - CONTENT_W) < 0.2
        line_h = 4.3
        pad_x, pad_y = 1.8, 1.5

        def row_height(cells: list[str], header: bool) -> float:
            style = "B" if header else ""
            size = 8 if header else 8.5
            tallest = 0.0
            for text, w in zip(cells, widths):
                self.pdf.set_font("Sans", style, size)
                th = self.pdf.multi_cell(
                    w - 2 * pad_x, line_h, text, dry_run=True, output="HEIGHT", wrapmode=WrapMode.WORD
                )
                tallest = max(tallest, th)
            return tallest + 2 * pad_y

        def paint(cells: list[str], header: bool, fill):
            h = row_height(cells, header)
            if self.pdf.get_y() + h > self.pdf.h - 16:
                self.pdf.add_page()
                if headers and not header:
                    paint(headers, True, HEAD_BG)
            y = self.pdf.get_y()
            x = ML
            self.pdf.set_fill_color(*fill)
            self.pdf.rect(ML, y, CONTENT_W, h, "F")
            self.pdf.set_draw_color(*LINE)
            self.pdf.line(ML, y + h, ML + CONTENT_W, y + h)
            style = "B" if header else ""
            size = 8 if header else 8.5
            self.pdf.set_text_color(255, 255, 255) if header else self.pdf.set_text_color(*INK)
            for text, w in zip(cells, widths):
                self.pdf.set_xy(x + pad_x, y + pad_y)
                self.pdf.set_font("Sans", style, size)
                self.pdf.multi_cell(w - 2 * pad_x, line_h, text, wrapmode=WrapMode.WORD)
                x += w
            self.pdf.set_y(y + h)

        self.ensure(14)
        if headers:
            paint(headers, True, HEAD_BG)
        for i, row in enumerate(rows):
            paint(row, False, ZEBRA if i % 2 == 0 else (255, 255, 255))
        self.gap(3.2)

    def decision(self, code: str, title: str, choice: str, reason: str, limit: str):
        parts = [("Choice", choice), ("Reason", reason), ("Limit", limit)]
        inner = CONTENT_W - 8
        title_h = h_of(self.pdf, inner - 14, title, "B", 11, 5)
        body_h = 0.0
        for label, text in parts:
            body_h += h_of(self.pdf, inner, label, "B", 8, 3.8)
            body_h += h_of(self.pdf, inner, text, "", 9.5, 4.4) + 1.5
        h = 3.0 + max(title_h, 5) + 1.4 + body_h + 1.2
        room = self.pdf.h - 16 - self.pdf.get_y()
        if h <= (self.pdf.h - 34) and h > room:
            self.pdf.add_page()
        y = self.pdf.get_y()
        self.pdf.set_fill_color(*CARD)
        self.pdf.rect(ML, y, CONTENT_W, h, "F")
        self.pdf.set_fill_color(*TEAL)
        self.pdf.rect(ML, y, 1.3, h, "F")
        self.pdf.set_xy(ML + 4, y + 2.4)
        self.pdf.set_font("Sans", "B", 9)
        self.pdf.set_text_color(*TEAL)
        self.pdf.cell(12, 5, code)
        self.pdf.set_font("Sans", "B", 11)
        self.pdf.set_text_color(*NAVY)
        self.pdf.multi_cell(inner - 14, 5, title, wrapmode=WrapMode.WORD)
        self.pdf.set_y(y + 2.4 + max(title_h, 5) + 1.2)
        for label, text in parts:
            self.pdf.set_x(ML + 4)
            self.pdf.set_font("Sans", "B", 8)
            self.pdf.set_text_color(*TEAL)
            self.pdf.multi_cell(inner, 3.8, label, wrapmode=WrapMode.WORD)
            self.pdf.set_x(ML + 4)
            self.pdf.set_font("Sans", "", 9.5)
            self.pdf.set_text_color(*INK)
            self.pdf.multi_cell(inner, 4.4, text, wrapmode=WrapMode.WORD)
            self.pdf.ln(1.3)
        self.pdf.set_y(y + h + 2.8)


def build() -> Doc:
    pdf = Doc(format="A4", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_title("NCRTC BMS — Additional Assumptions and Decisions")
    pdf.set_author("Anushka Singh Rajput")
    pdf.set_subject("ADD-01, 23 October 2026. As built. For team-leader review.")
    pdf.set_creator("NCRTC BMS project")
    pdf.add_font("Sans", "", SANS)
    pdf.add_font("Sans", "B", SANS_SEMI)
    pdf.add_font("Serif", "", SERIF)
    pdf.add_font("Serif", "B", SERIF_B)
    pdf.alias_nb_pages()
    pdf.add_page()
    w = Writer(pdf)

    pdf.set_font("Sans", "B", 8.5)
    pdf.set_text_color(*TEAL)
    pdf.cell(CONTENT_W, 4.5, "PROJECT RECORD", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Serif", "B", 20)
    pdf.set_text_color(*NAVY)
    pdf.multi_cell(CONTENT_W, 8.2, "Additional assumptions\nand decisions")
    w.gap(1)
    pdf.set_font("Sans", "", 10.5)
    pdf.set_text_color(*INK)
    pdf.multi_cell(CONTENT_W, 5, "NCRTC Bus Management System  —  student build, as it stands in the repository.")
    w.gap(2.5)

    w.table(
        None,
        [
            ["Document", "ADD-01, version 1.0"],
            ["Date", "23 October 2026"],
            ["Status", "As built. This is a record, not a proposal."],
            ["Prepared by", "Anushka Singh Rajput"],
            ["For", "Team-leader review"],
            ["Brief", "Student Project Brief (Lite) v1.0"],
            ["Code", "github.com/AnushkaSinghRajput/ncrtc-bus-management-system"],
        ],
        [32, CONTENT_W - 32],
    )

    w.note(
        "Read this first. Bus positions in this project are simulated. A script inserts GPS rows into the database. "
        "There is no GPS device, and there is no connection to NCRTC's operational systems. The brief asks for this "
        "to be said plainly. The rest of this note is the same kind of statement: what we assumed, what we chose, "
        "and what we did not build."
    )

    w.h1("1.  What this document is")
    w.p(
        "The brief fixes the four modules, the roles, the tables, and the demo. It also leaves some choices open, "
        "and it lists stretch items without fixing their exact rules. This note records those points so a reviewer "
        "can see them without reading the code."
    )
    w.p("It does not replace the brief, the README, or ARCHITECTURE.md. If the code changes, this note is out of date until it is revised.")
    w.p("Three kinds of statement are used:")
    w.bullet("Assumption. Something we are taking as given, usually because the brief says so.")
    w.bullet("Decision. A choice between options, with the limit that comes with it.")
    w.bullet("Not built. An item in the brief that is not in this repository.")

    w.h1("2.  Assumptions")
    w.p("These are the conditions the build is written for. They are not claims about NCRTC's real operation.")
    w.table(
        ["No.", "Assumption", "What follows"],
        [
            [
                "A1",
                "Operational data is dummy data loaded by a seed script on an empty database.",
                "Depots, vehicles, people, routes, duties, incidents and notices are not live NCRTC records. Person names come from a name library with a fixed seed.",
            ],
            [
                "A2",
                "There is no GPS hardware and no feed from NCRTC.",
                "A position exists only because our code inserted a row. See D2.",
            ],
            [
                "A3",
                "A duty is one driver, one vehicle, one route, and one date, with one start and one end.",
                "The brief's domain text says a duty can cover more than one trip. The table in the brief has a single route and a single start and end. We followed the table. We do not store a list of trips on a duty.",
            ],
            [
                "A4",
                "Depot managers, drivers and conductors see only their own depot. Admin and control room see all depots.",
                "List and detail APIs apply that filter. Admin and control-room accounts have no depot.",
            ],
            [
                "A5",
                "A vehicle with a published or acknowledged duty today is expected to be out on a route, not inside the depot.",
                "That is how we read the geofence item (\"outside the depot when it should be inside\"). Those vehicles are not flagged. See D8.",
            ],
            [
                "A6",
                "The demo password is shared and is not a secret.",
                "Every seeded account uses the password \"password\". The README marks this as demo only. It must not be reused outside the demo.",
            ],
            [
                "A7",
                "Map and admin screens are for a laptop. The driver and conductor screen is for a phone.",
                "The brief sets this split. The phone layout is the /driver route. The map, roster and admin pages are not a phone app.",
            ],
            [
                "A8",
                "The demo size is about 50 vehicles and 80 users. The brief also says the design should still work at 500 vehicles.",
                "The seed is 50 vehicles and 80 users. We have not run a test at 500 vehicles, so that figure is not a measured result.",
            ],
            [
                "A9",
                "Notice text is English only.",
                "A Hindi body is listed in the brief as a stretch item, not a requirement. There is no second language field.",
            ],
        ],
        [12, 78, CONTENT_W - 90],
    )

    w.h1("3.  Decisions")
    w.p(
        "Each decision states the choice, the reason, and the limit. The limit is what that choice does not cover."
    )

    w.decision(
        "D1",
        "One application, the stack in the brief",
        "Python, FastAPI, SQLAlchemy and Alembic. PostgreSQL 16 with PostGIS. React, Vite, TypeScript and Tailwind. Leaflet with OpenStreetMap tiles. Docker Compose runs four services: database, API, GPS tick, and the web app.",
        "This is the stack section 5 of the brief recommends. TypeScript is added so the screens use the same field names as the API. Tailwind is the only styling method, so form controls share one height and pages line up.",
        "No Redis, no message queue, no separate ingest service, and no native mobile app. The brief says those are out of scope. The driver \"app\" is a route in the same web app.",
    )
    w.decision(
        "D2",
        "Live positions come from a tick script, and the map polls",
        "A separate process inserts one GPS row per selected vehicle. The default interval is 7 seconds. The map requests the latest position of each vehicle every 5 seconds.",
        "The brief offers two ways to animate the map and recommends the tick script. It also says to poll first, and to add WebSocket only if there is time. We stayed with polling.",
        "The tick does not follow roads. If the vehicle has a published or acknowledged duty today, the next point steps toward the next stop on its route. The speed stored on the row is a random number in a band, not distance divided by time. A vehicle with no duty is moved only when its id is divisible by 3, and only if it already has a ping, so the map is not empty. WebSocket updates are not built.",
    )
    w.decision(
        "D3",
        "Sign-in is bcrypt and a JWT kept in the browser",
        "Passwords are hashed with bcrypt. Login is the OAuth2 password form. The API returns a JWT signed with HS256, valid for 480 minutes. The browser stores it in localStorage. Every API route except login, health, the API docs, and uploaded files requires that token.",
        "The brief requires bcrypt, JWT, and a role check on each route.",
        "Any script running on the page can read localStorage. That is acceptable for this demo. It is not a production session design. The demo signing key is in the env example and must be changed if this is deployed for anything other than a demo. Incident photos are served from /uploads without a login check.",
    )
    w.decision(
        "D4",
        "Five roles, and one renamed",
        "The roles are driver, conductor, depot_manager, control_room_operator, and admin. The brief's auth section uses the name control_operator for the control-room job. We used control_room_operator.",
        "The longer name matches the role description in the brief (\"Control-room operator\"). The permissions are the ones in the brief: depot scope for managers, drivers and conductors; all depots for admin and control room.",
        "The executive read-only role in section 3 of the brief is not a role here. There is no daily report and no PDF export for that role. A conductor sees today's duty on the phone screen but cannot acknowledge it. Acknowledgement is the driver role only. Both driver and conductor can use the panic button.",
    )
    w.decision(
        "D5",
        "The eleven tables, with the depot area stored as JSON",
        "The tables are the ones in section 6 of the brief. No extra tables were added. The depot outline is GeoJSON in a JSON column. A geofence check converts that JSON with PostGIS on each request.",
        "The brief's column is polygon_geojson, not a geometry column. We kept that shape.",
        "There is no spatial index on the outline. With five depots that cost is small. It is the wrong shape for a large number of areas. The three indexes the brief names do exist: gps ping by vehicle and time, duty by date and depot, incident by status and depot.",
    )
    w.decision(
        "D6",
        "Schema is created two ways, and seed runs once",
        "Alembic revision 001 creates the tables. On startup the API also calls create_all, then loads the seed only if the user table is empty.",
        "A fresh docker compose up should reach a working demo without a manual migration command. create_all does not alter columns that already exist.",
        "A later model change is not applied to a database that already has data, unless a new Alembic revision is written and run. The supported reset is an empty database volume.",
    )
    w.decision(
        "D7",
        "What the seed actually contains",
        "5 depots: Noida Sector 37, Anand Vihar, Ghaziabad, Sahibabad, Duhai. 50 vehicles (42 active, 5 idle, 3 in maintenance). 80 users: 1 admin, 2 control room, 5 depot managers, 50 drivers, 22 conductors. 12 routes. Duties for the Monday–Sunday week that contains today: days after tomorrow are partly draft, and the first duty of each depot today is already acknowledged. 12 vehicles have a yesterday trail of 40 points, three minutes apart. 6 incidents in mixed states. 3 notices. On the safety notice, 8 drivers have acknowledged it and 4 more have read it without acknowledging.",
        "These counts sit inside the ranges in section 4 of the brief (3–5 depots, about 50 vehicles, about 80 users, 10–15 routes, one week of duties, history for at least 10 vehicles, a handful of incidents, 2–3 notices).",
        "Depot coordinates are approximate. Each depot outline is a square of about 0.9 km around that point, not a surveyed boundary. Stop names are real NCR place names with coordinates set by hand. Yesterday's trail is a straight interpolation between those stops, with a small jitter. It is not a trace recorded on a road.",
    )
    w.decision(
        "D8",
        "Geofence rule, stated exactly",
        "A vehicle is listed when all three are true: its latest ping is less than 10 minutes old, that point is outside its depot square (PostGIS ST_Contains), and it has no duty today in status published or acknowledged. The distance shown is from the depot centre point, in metres, not from the edge of the square. Depot managers only receive their own depot. The check runs on each request.",
        "The brief's stretch line is \"outside the depot polygon when it should be inside\". A5 says a vehicle on a duty should be outside. Flagging those buses would mark normal trips as breaches.",
        "The result is not stored. Nobody can acknowledge or close it. A vehicle that has gone quiet for more than 10 minutes drops off the list even if it is still outside. The square is the seeded outline from D7, not a real fence.",
    )
    w.decision(
        "D9",
        "Marker colour is motion, not punctuality",
        "On the live map a marker is teal when speed is above 1 km/h, gold when it is not, and grey when the latest ping is more than 2 minutes old. The selected marker is drawn larger.",
        "We have a speed and a time on each ping, so this colour can be computed from data we actually store.",
        "The brief's stretch line is on-time green, late amber, idle grey. We do not compare a ping with the planned minute offset of a stop, so the screen cannot say whether a bus is late. Those colours are not implemented.",
    )
    w.decision(
        "D10",
        "Trip history can be replayed",
        "Pick a vehicle and a date. The page draws the day's points, then a slider, play and pause, and speeds of 1, 5 and 20 times. Four figures are shown: path length, time from the first ping to the last, average of the stored speeds, and the highest stored speed. The live-map \"replay today\" link opens this page with the vehicle and the date filled in.",
        "A replay slider is a stretch item in the brief (play, pause, 5 times). The extra speeds and the four figures are small additions on the same page.",
        "Path length is the sum of straight lines between pings, not road distance. Average and top speed use the speed values stored on the rows. Under D2 and D7 those values are assigned, not measured from the movement. An empty day shows an empty state. It does not invent a path.",
    )
    w.decision(
        "D11",
        "Duties are draft, then published, then acknowledged",
        "A new duty is a draft. A manager can publish one duty, or every draft in a date range. The driver acknowledges a published duty, and the time is stored. Creating a duty is rejected if that driver already has a duty that is not cancelled on that date. Copy-week copies one Monday-to-Sunday roster onto another week as drafts, and skips a driver who already has a duty on the target day. The roster page can move week by week. An empty cell fills the assign form for that driver and date.",
        "The brief requires draft then publish, then acknowledge with a timestamp, and lists the double-booking check and \"copy last week\" as useful additions. Both are included.",
        "The conflict check is on the driver only. The same vehicle can be named on two duties the same day. A conductor is not checked either. Copy-week does not look at vehicle clashes. The API can create, replace and delete a route. The scheduling screen creates and deletes routes. It has no edit form. Leave requests are not built.",
    )
    w.decision(
        "D12",
        "Incident flow and the panic button",
        "Anyone signed in can raise an incident, with a type, a severity, a description, an optional vehicle, and an optional photo. Status can move only along these edges: open to acknowledged or closed; acknowledged to in progress or closed; in progress to resolved or closed; resolved to closed. Each move requires a note and writes a timeline row. Resolved stores the time. The panic button, for a driver or conductor, creates a P1 incident. If they have a published or acknowledged duty today, that vehicle is attached, and the vehicle's latest GPS point is copied onto the incident when a point exists.",
        "This is the state machine, the note, the assignment, and the panic button from the brief. The photo is stored on a Docker volume and served from /uploads.",
        "The panic location is the bus's last stored ping, which can be minutes old. The phone does not send its own GPS fix. Photos are lost if the upload volume is removed. They are not in object storage.",
    )
    w.decision(
        "D13",
        "SLA numbers are ours, and they run in the browser only",
        "The list shows a countdown. While the incident is open, the clock is \"time to acknowledge\". After that, until it is resolved or closed, the clock is \"time to resolve\". Both are measured from the time the incident was raised. The targets we used are: P1, acknowledge in 15 minutes and resolve in 4 hours; P2, 1 hour and 24 hours; P3, 4 hours and 72 hours. A past-due active incident is shown in red, and the page can filter to those rows.",
        "The brief asks for a visible timer and a red mark when the time is past, as a stretch item. It suggests a single timer of 1 hour, 4 hours and 24 hours. We split acknowledge and resolve, and we did not use those three numbers. This note is the record of that difference.",
        "The API does not store a due time, does not reject a late update, and does not notify anyone. Closing the page stops the clock. A different browser could show a different rule if this file were changed. The numbers above are only in frontend/src/lib/sla.ts.",
    )
    w.decision(
        "D14",
        "Notices, and who has not read one",
        "An admin publishes a notice to one of: everyone, all drivers and conductors, one role, or one depot. Opening a notice marks it read for that user. If the notice requires acknowledgement, a separate button records that. Managers and admins can open a list of every active user the notice targets, including people with no read row, with counts for read, acknowledged, and not yet read. A depot manager sees only users in their depot.",
        "The brief requires the audience, the unread list on the driver side, and a receipt list that shows who has and who has not read the notice. A list of reads alone cannot show the people who never opened it, so the audience list was added.",
        "The body is plain text. It is not rendered as Markdown, it is not bilingual, and a notice cannot carry a PDF. The older receipts call still exists and returns only people who have a read row.",
    )
    w.decision(
        "D15",
        "Admin can add buses and accounts",
        "An admin can register a vehicle and create a user. A driver, conductor or depot manager must have a depot. An admin can deactivate a user. A deactivated user cannot log in. An admin cannot deactivate their own account or remove their own admin role. Vehicle status can be changed by an admin, or by the depot manager of that vehicle's depot. Only an admin can move a vehicle to another depot.",
        "Section 3 of the brief says the admin adds vehicles and users. The manager's depot limit from A4 is kept on the status change.",
        "There is no password-reset flow. The person creating the account sets the first password. There is no screen to edit a depot, and no screen to edit a user's name after creation. Deactivate and reactivate is the account action the screen offers.",
    )
    w.decision(
        "D16",
        "Tests that exist, and the CI that does not",
        "20 API tests run against a seeded stack (pytest inside the backend container). They cover login, depot isolation, duties, incidents, notices, the geofence list, copy-week, and creating a user and a vehicle change. 12 frontend tests run without the stack. They cover date helpers, the API error parser, distance maths, the SLA labels, and the app shell.",
        "The brief asks for a handful of meaningful tests rather than a large set of trivial ones. These tests call the running API or check a pure function.",
        "The API tests do nothing if the stack is not running. One older duty test skips itself when its chosen driver is already assigned that day. The brief suggests GitHub Actions early. There is no workflow file in this repository. We have not load-tested 500 vehicles (A8).",
    )

    w.h1("4.  Where this build differs from the brief")
    w.p("Collected in one place. The decision number has the detail.")
    w.table(
        ["Topic", "Brief", "This build"],
        [
            ["Live map", "Tick script, or replay of yesterday. Poll first.", "Tick script, poll every 5 seconds. No WebSocket. D2."],
            ["Marker colour (stretch)", "On time, late, idle.", "Moving, stopped, or no ping for 2 minutes. Late is not calculated. D9."],
            ["Geofence (stretch)", "Outside the depot when it should be inside.", "Outside the seeded square, ping under 10 minutes old, and no duty today. Not stored. D8."],
            ["SLA timer (stretch)", "One clock: P1 1 hour, P2 4 hours, P3 24 hours.", "Two clocks, different numbers, browser only. D13."],
            ["History replay (stretch)", "Play, pause, 5 times.", "Play, pause, 1, 5 and 20 times, plus four figures. D10."],
            ["Copy last week (stretch)", "A button.", "Copies a week as drafts and skips a driver who is already rostered. D11."],
            ["Who has not read a notice", "Show who has and who has not.", "The audience list includes people with no read row. D14."],
            ["Control-room role name", "control_operator", "control_room_operator. Same job. D4."],
            ["Executive role", "Read-only, maybe a PDF report.", "Not built."],
            ["Duty and trips", "A duty may be one or more trips.", "One route and one start and end, as in the brief's table. A3."],
            ["CI", "GitHub Actions suggested.", "Not in the repository. D16."],
        ],
        [42, 62, CONTENT_W - 104],
    )

    w.h1("5.  Not built")
    w.p("These are in the brief. They are not in this repository. They are listed so the demo does not imply they exist.")
    w.table(
        ["Item", "Where the brief puts it", "State"],
        [
            ["Executive read-only role and a downloadable report", "Section 3", "Not built."],
            ["WebSocket live updates", "Stack section, stretch credit", "Not built. The map polls."],
            ["On-time and late marker colours", "AVLS stretch", "Not built. See D9."],
            ["Leave request and manager approval", "Scheduling stretch", "Not built."],
            ["Hindi notice text", "CMS stretch", "Not built."],
            ["PDF attached to a notice", "CMS stretch", "Not built."],
            ["Server-side SLA check or a notification on breach", "Not specified. The stretch item is a visible timer.", "Not built. The clock is in the browser. D13."],
            ["A stored geofence event that someone can close", "AVLS stretch", "Not built. The list is a query. D8."],
            ["GitHub Actions", "Stack section", "Not in the repository."],
            ["GPS ingest from a device, via a queue", "Section 4, to be shown as a diagram, not built", "Not built. The tick script writes to the database."],
            ["A test at 500 vehicles", "Quality bar", "Not run."],
        ],
        [78, 52, CONTENT_W - 130],
    )

    w.h1("6.  What to say in the review")
    w.p("Short enough to say aloud. Each line is already backed by a section above.")
    w.bullet("The data is seeded. The moving map is a script writing rows every few seconds.")
    w.bullet("Depot outlines are squares around approximate points, not real boundaries.")
    w.bullet("A geofence row means \"no duty today, and the last ping is outside the depot square\". It is not saved.")
    w.bullet("Map colour is moving, stopped, or silent. It is not on time or late.")
    w.bullet("The incident timers use our numbers, not the 1 hour / 4 hour / 24 hour line in the brief, and the server does not enforce them.")
    w.bullet("Panic sends the bus's last stored position, not the phone's location.")
    w.bullet("The executive role, leave, Hindi notices, WebSocket, and CI are not in this build.")

    w.h1("7.  Related records")
    w.table(
        ["Record", "Where"],
        [
            ["This note", "docs/NCRTC_BMS_Assumptions_and_Decisions.pdf"],
            ["How to run the demo", "README.md in the repository"],
            ["Module and API description", "ARCHITECTURE.md in the repository"],
            ["The brief this note adds to", "Student Project Brief (Lite) v1.0"],
            ["API reference, when the stack is running", "http://localhost:8000/docs"],
            ["SLA numbers in code", "frontend/src/lib/sla.ts"],
            ["Geofence query in code", "backend/app/api/avls.py"],
            ["Seed contents in code", "backend/app/seed.py"],
        ],
        [78, CONTENT_W - 78],
    )
    w.p(
        "Version 1.0, 23 October 2026. It describes the repository on that date. "
        "Prepared by Anushka Singh Rajput for team-leader review.",
        size=9,
    )
    return pdf


if __name__ == "__main__":
    doc = build()
    doc.output(str(OUT))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {doc.pages_count} pages)")
