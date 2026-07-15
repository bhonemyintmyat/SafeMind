from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


OUT = Path("artifacts/SafeMind_User_Survey_MM_draft.docx")
# Named Google Docs preset override: Myanmar-capable sans serif for readable
# Burmese shaping in DOCX renderers and after Google Docs import.
FONT = "Noto Sans Myanmar"
INK = "000000"
MUTED = "555555"
BORDER = "DADCE0"


def set_run_font(run, size=None, bold=None, color=INK):
    run.font.name = FONT
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), FONT)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:hAnsi"), FONT)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:cs"), FONT)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = tcPr.first_child_found_in("w:tcMar")
    if tcMar is None:
        tcMar = OxmlElement("w:tcMar")
        tcPr.append(tcMar)
    for edge, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        tag = "w:" + edge
        node = tcMar.find(qn(tag))
        if node is None:
            node = OxmlElement(tag)
            tcMar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths_dxa):
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    tblPr = table._tbl.tblPr
    tblW = tblPr.first_child_found_in("w:tblW")
    if tblW is None:
        tblW = OxmlElement("w:tblW")
        tblPr.append(tblW)
    tblW.set(qn("w:w"), str(sum(widths_dxa)))
    tblW.set(qn("w:type"), "dxa")
    tblInd = tblPr.first_child_found_in("w:tblInd")
    if tblInd is None:
        tblInd = OxmlElement("w:tblInd")
        tblPr.append(tblInd)
    tblInd.set(qn("w:w"), "0")
    tblInd.set(qn("w:type"), "dxa")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)

    for row in table.rows:
        for i, cell in enumerate(row.cells):
            tcW = cell._tc.get_or_add_tcPr().first_child_found_in("w:tcW")
            if tcW is None:
                tcW = OxmlElement("w:tcW")
                cell._tc.get_or_add_tcPr().append(tcW)
            tcW.set(qn("w:w"), str(widths_dxa[i]))
            tcW.set(qn("w:type"), "dxa")
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def set_quiet_borders(table):
    tblPr = table._tbl.tblPr
    borders = tblPr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tblPr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = borders.find(qn(f"w:{edge}"))
        if element is None:
            element = OxmlElement(f"w:{edge}")
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "4")
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), BORDER)


def add_title(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(text)
    set_run_font(r, 26, False)


def add_subtitle(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(16)
    r = p.add_run(text)
    set_run_font(r, 11, False, MUTED)


def add_heading(doc, text, level=1):
    return doc.add_heading(text, level=level)


def add_text(doc, text, bold_prefix=None, muted=False, after=8):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    if bold_prefix and text.startswith(bold_prefix):
        r1 = p.add_run(bold_prefix)
        set_run_font(r1, 11, True, MUTED if muted else INK)
        r2 = p.add_run(text[len(bold_prefix):])
        set_run_font(r2, 11, False, MUTED if muted else INK)
    else:
        r = p.add_run(text)
        set_run_font(r, 11, False, MUTED if muted else INK)
    return p


def add_question(doc, number, text, required=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(f"{number}. {text}")
    set_run_font(r, 11, True)
    if required:
        rr = p.add_run("  *")
        set_run_font(rr, 11, True, "B3261E")
    return p


def add_options(doc, options, columns=1):
    if columns == 1:
        for option in options:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.space_after = Pt(3)
            r = p.add_run(f"□ {option}")
            set_run_font(r, 11)
    else:
        rows = (len(options) + columns - 1) // columns
        table = doc.add_table(rows=rows, cols=columns)
        widths = [9360 // columns] * columns
        widths[-1] += 9360 - sum(widths)
        set_table_geometry(table, widths)
        for i, option in enumerate(options):
            cell = table.cell(i // columns, i % columns)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(f"□ {option}")
            set_run_font(r, 10.5)
        for i in range(len(options), rows * columns):
            table.cell(i // columns, i % columns).text = ""
        set_quiet_borders(table)


def add_line(doc, label="ဖြေဆိုရန်"):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.25)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(f"{label}  ______________________________________________________________")
    set_run_font(r, 11, False, MUTED)


def add_long_answer(doc, lines=3):
    for _ in range(lines):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.space_after = Pt(7)
        r = p.add_run("________________________________________________________________________")
        set_run_font(r, 11, False, MUTED)


def add_scale_legend(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(9)
    r = p.add_run("အဆင့်သတ်မှတ်ချက် — 1 = လုံးဝသဘောမတူ၊ 2 = သဘောမတူ၊ 3 = မသေချာ/အလယ်အလတ်၊ 4 = သဘောတူ၊ 5 = အပြည့်အဝသဘောတူ")
    set_run_font(r, 10.5, False, MUTED)


def add_scale_item(doc, number, text, na=False):
    add_question(doc, number, text)
    choices = "○ 1      ○ 2      ○ 3      ○ 4      ○ 5"
    if na:
        choices += "      ○ မသက်ဆိုင်ပါ"
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.25)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(choices)
    set_run_font(r, 11)


def add_page_break(doc):
    doc.add_page_break()


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Inches(8.5)
    sec.page_height = Inches(11)
    sec.top_margin = Inches(1)
    sec.bottom_margin = Inches(1)
    sec.left_margin = Inches(1)
    sec.right_margin = Inches(1)
    sec.header_distance = Inches(0.492)
    sec.footer_distance = Inches(0.492)

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    normal.font.size = Pt(11)
    normal.font.color.rgb = RGBColor(0, 0, 0)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(8)
    normal.paragraph_format.line_spacing = 1.15

    for name, size, before, after, color in (
        ("Heading 1", 20, 20, 6, INK),
        ("Heading 2", 16, 18, 6, INK),
        ("Heading 3", 14, 16, 4, "434343"),
    ):
        style = doc.styles[name]
        style.font.name = FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        style.font.size = Pt(size)
        style.font.bold = False
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    add_title(doc, "SafeMind အသုံးပြုသူ စစ်တမ်း")
    add_subtitle(doc, "အသုံးပြုသူအတွေ့အကြုံ၊ ယုံကြည်မှုနှင့် အွန်လိုင်းလိမ်လည်မှုကာကွယ်ရေးဆိုင်ရာ အမြင်များ")

    add_heading(doc, "စစ်တမ်းအကြောင်း", 1)
    add_text(doc, "ဤစစ်တမ်းသည် SafeMind ဝဘ်အက်ပ်ကို စမ်းသပ်အသုံးပြုပြီးနောက် အသုံးပြုရလွယ်ကူမှု၊ ရလဒ်နားလည်လွယ်မှု၊ ယုံကြည်မှုနှင့် တိုးတက်အောင်ပြုလုပ်ရမည့်အချက်များကို လေ့လာရန် ရည်ရွယ်ပါသည်။ ဖြေဆိုရန် ၇–၁၀ မိနစ်ခန့် ကြာနိုင်ပါသည်။")
    add_text(doc, "ပါဝင်ခြင်းသည် မိမိဆန္ဒအလျောက်ဖြစ်ပြီး မဖြေလိုသော မေးခွန်းကို ကျော်နိုင်ပါသည်။ အမည်၊ ဖုန်းနံပါတ်၊ စကားဝှက်၊ OTP၊ ဘဏ်အကောင့်အချက်အလက် သို့မဟုတ် အမှန်တကယ်ရရှိထားသော လိမ်လည်စာ/လင့်ခ်များကို ဤစစ်တမ်းတွင် မထည့်ပါနှင့်။")
    add_text(doc, "* မဖြစ်မနေဖြေဆိုရန် အမှတ်အသား", muted=True)

    add_heading(doc, "သဘောတူညီချက်", 2)
    add_question(doc, "C1", "အထက်ပါအချက်အလက်ကို နားလည်ပြီး ဤစစ်တမ်းတွင် ပါဝင်ရန် သဘောတူပါသည်။", required=True)
    add_options(doc, ["သဘောတူပါသည် — စစ်တမ်းကို ဆက်ဖြေမည်", "သဘောမတူပါ — စစ်တမ်းကို ရပ်မည်"])

    add_heading(doc, "အပိုင်း (က) — ဖြေဆိုသူအကြောင်း", 1)
    add_text(doc, "အောက်ပါ မေးခွန်းများသည် သုံးစွဲသူအုပ်စုအလိုက် လိုအပ်ချက်ကွာခြားမှုကို နားလည်ရန်သာ ဖြစ်ပါသည်။")
    add_question(doc, 1, "အသက်အုပ်စု (မဖြေလိုပါက ကျော်နိုင်သည်)")
    add_options(doc, ["၁၈ နှစ်အောက်", "၁၈–၂၄", "၂၅–၃၄", "၃၅–၄၄", "၄၅–၅၄", "၅၅ နှစ်နှင့်အထက်", "မဖြေလိုပါ"], columns=2)
    add_question(doc, 2, "သင်နေထိုင်ရာ နေရာအမျိုးအစား")
    add_options(doc, ["မြို့ပြ", "မြို့ငယ်/ဆင်ခြေဖုံး", "ကျေးလက်", "မဖြေလိုပါ"], columns=2)
    add_question(doc, 3, "သင်၏ အဓိကအလုပ်အကိုင်/အခြေအနေ")
    add_options(doc, ["ကျောင်းသား/သူ", "ဝန်ထမ်း", "ကိုယ်ပိုင်လုပ်ငန်း", "အလွတ်တန်း", "အိမ်မှုကိစ္စ", "အလုပ်ရှာနေသူ", "အခြား", "မဖြေလိုပါ"], columns=2)

    add_heading(doc, "အပိုင်း (က) — ဒစ်ဂျစ်တယ်အသုံးပြုမှုနှင့် လိမ်လည်မှုအတွေ့အကြုံ", 1)
    add_question(doc, 4, "သင် အင်တာနက်ကို မည်မျှ မကြာခဏ အသုံးပြုသနည်း။")
    add_options(doc, ["နေ့တိုင်း အကြိမ်များစွာ", "နေ့တိုင်း တစ်ကြိမ်ခန့်", "တစ်ပတ်လျှင် အကြိမ်အနည်းငယ်", "အသုံးနည်းသည်"])
    add_question(doc, 5, "မသင်္ကာဖွယ် ဖုန်းခေါ်ဆိုမှု၊ စာတို၊ အီးမေးလ် သို့မဟုတ် လင့်ခ်ကို နောက်ဆုံး ၁၂ လအတွင်း ကြုံတွေ့ဖူးပါသလား။")
    add_options(doc, ["ကြုံတွေ့ဖူးသည်", "မကြုံတွေ့ဖူးပါ", "မသေချာပါ"])
    add_question(doc, 6, "ကြုံတွေ့ဖူးသော အမျိုးအစားများ (တစ်ခုထက်ပိုရွေးနိုင်သည်)")
    add_options(doc, ["ဖုန်းခေါ်ဆိုမှု", "SMS/Chat စာတို", "အီးမေးလ်", "ဝဘ်ဆိုက်/လင့်ခ်", "လူမှုကွန်ရက်အကောင့်", "ငွေပေးချေမှု/ဘဏ်အယောင်ဆောင်", "အွန်လိုင်းဈေးဝယ်", "မကြုံတွေ့ဖူးပါ", "အခြား"], columns=2)
    add_question(doc, 7, "မသင်္ကာဖွယ်အကြောင်းအရာကို တွေ့သောအခါ သင်ပုံမှန် လုပ်ဆောင်သည့်အရာများ (တစ်ခုထက်ပိုရွေးနိုင်သည်)")
    add_options(doc, ["မနှိပ်ဘဲ/မတုံ့ပြန်ဘဲ ဖျက်သည်", "ပို့သူကို ပိတ်ဆို့သည်", "အဖွဲ့အစည်း၏ တရားဝင်လမ်းကြောင်းမှ စစ်ဆေးသည်", "သူငယ်ချင်း/မိသားစုကို မေးသည်", "အွန်လိုင်းတွင် ရှာဖွေစစ်ဆေးသည်", "တိုင်ကြားသည်", "မည်သို့လုပ်ရမည် မသေချာပါ", "အခြား"], columns=2)
    add_question(doc, 8, "လိမ်လည်မှုအန္တရာယ်ကို ကိုယ်တိုင်ခွဲခြားနိုင်မှုအပေါ် သင်မည်မျှ ယုံကြည်မှုရှိသနည်း။")
    add_text(doc, "○ 1 လုံးဝမယုံကြည်      ○ 2      ○ 3      ○ 4      ○ 5 အလွန်ယုံကြည်", after=4)

    add_heading(doc, "အပိုင်း (ခ) — SafeMind ကို စမ်းသပ်အသုံးပြုခြင်း", 1)
    add_text(doc, "ဤအပိုင်းမဖြေမီ SafeMind တွင် စာတို၊ ဖုန်းနံပါတ် သို့မဟုတ် လင့်ခ်တစ်မျိုးမျိုးကို နမူနာအချက်အလက်ဖြင့် စမ်းသပ်ပါ။ ကိုယ်ရေးအချက်အလက်အစစ် မထည့်ပါနှင့်။")
    add_question(doc, 9, "သင် စမ်းသပ်အသုံးပြုခဲ့သော လုပ်ဆောင်ချက်များ (တစ်ခုထက်ပိုရွေးနိုင်သည်)")
    add_options(doc, ["ဖုန်းနံပါတ် စစ်ဆေးခြင်း", "စာတို စစ်ဆေးခြင်း", "လင့်ခ် စစ်ဆေးခြင်း", "အီးမေးလ်/တရားဝင်ဆက်သွယ်ရန် လိပ်စာကြည့်ခြင်း", "လိမ်လည်မှုအဖြစ် တိုင်ကြားခြင်း", "ဒက်ရှ်ဘုတ်/မှတ်တမ်းကြည့်ခြင်း", "လိမ်လည်မှု ပညာပေးအကြောင်းအရာဖတ်ခြင်း"], columns=2)

    add_heading(doc, "အပိုင်း (ဂ) — အသုံးပြုရလွယ်ကူမှုနှင့် ယုံကြည်မှု", 1)
    add_scale_legend(doc)
    add_scale_item(doc, 10, "SafeMind ကို စတင်အသုံးပြုရန် လွယ်ကူသည်။")
    add_scale_item(doc, 11, "မိမိလိုချင်သော လုပ်ဆောင်ချက်ကို ရှာဖွေရန် လွယ်ကူသည်။")
    add_scale_item(doc, 12, "မြန်မာဘာသာဖြင့် ဖော်ပြထားသော စာသားများသည် နားလည်လွယ်သည်။")
    add_scale_item(doc, 13, "စာလုံးအရွယ်အစား၊ အရောင်နှင့် စာမျက်နှာပုံစံသည် ဖတ်ရှုရလွယ်ကူသည်။")
    add_scale_item(doc, 14, "စစ်ဆေးမှုအမြန်နှုန်းသည် လုံလောက်သည်။")
    add_scale_item(doc, 15, "“လိမ်လည်မှု/လုံခြုံ/မသေချာ” ရလဒ်ကို နားလည်လွယ်သည်။")
    add_scale_item(doc, 16, "အန္တရာယ်အဆင့်နှင့် ယုံကြည်မှုရာခိုင်နှုန်းကို နားလည်လွယ်သည်။")
    add_scale_item(doc, 17, "ရလဒ်နှင့်အတူ ဖော်ပြသော အကြောင်းပြချက်/သတိပေးလက္ခဏာများက အသုံးဝင်သည်။")
    add_scale_item(doc, 18, "SafeMind ၏ စစ်ဆေးမှုရလဒ်ကို ယုံကြည်နိုင်သည်ဟု ခံစားရသည်။")
    add_scale_item(doc, 19, "ရလဒ်ရရှိပြီးနောက် ဘာဆက်လုပ်ရမည်ကို သိရှိစေသည်။")
    add_scale_item(doc, 20, "လိမ်လည်မှု တိုင်ကြားရန် သို့မဟုတ် ပြန်လည်စစ်ဆေးရန် တောင်းဆိုရန် လွယ်ကူသည်။", na=True)
    add_scale_item(doc, 21, "လိမ်လည်မှုကာကွယ်ရေး ပညာပေးအကြောင်းအရာသည် အသုံးဝင်သည်။", na=True)

    add_heading(doc, "အပိုင်း (ဃ) — အကျိုးရှိမှုနှင့် ဆက်လက်အသုံးပြုလိုစိတ်", 1)
    add_question(doc, 22, "SafeMind အသုံးပြုပြီးနောက် မသင်္ကာဖွယ်အကြောင်းအရာကို ခွဲခြားနိုင်မှုအပေါ် သင်မည်မျှ ယုံကြည်မှုရှိသနည်း။")
    add_text(doc, "○ 1 လုံးဝမယုံကြည်      ○ 2      ○ 3      ○ 4      ○ 5 အလွန်ယုံကြည်", after=4)
    add_question(doc, 23, "SafeMind က သင့်အား မလုံခြုံသော လင့်ခ်နှိပ်ခြင်း၊ အချက်အလက်မျှဝေခြင်း သို့မဟုတ် ငွေပေးချေခြင်းမပြုမီ ရပ်တန့်စဉ်းစားစေနိုင်မည်ဟု ထင်ပါသလား။")
    add_options(doc, ["သေချာပေါက် စေနိုင်သည်", "ဖြစ်နိုင်သည်", "မသေချာပါ", "ဖြစ်နိုင်ခြေနည်းသည်", "လုံးဝ မစေနိုင်ပါ"])
    add_question(doc, 24, "နောင်တွင် မသင်္ကာဖွယ် ဖုန်းနံပါတ်၊ စာတို သို့မဟုတ် လင့်ခ်တွေ့ပါက SafeMind ကို ပြန်အသုံးပြုနိုင်ခြေ မည်မျှရှိသနည်း။")
    add_text(doc, "○ 0 လုံးဝမဖြစ်နိုင်                                              ○ 10 သေချာပေါက်အသုံးပြုမည်")
    add_text(doc, "○ 0   ○ 1   ○ 2   ○ 3   ○ 4   ○ 5   ○ 6   ○ 7   ○ 8   ○ 9   ○ 10", after=4)
    add_question(doc, 25, "SafeMind ကို သူငယ်ချင်း သို့မဟုတ် မိသားစုအား အကြံပြုနိုင်ခြေ မည်မျှရှိသနည်း။")
    add_text(doc, "○ 0 လုံးဝအကြံမပြု                                              ○ 10 သေချာပေါက်အကြံပြုမည်")
    add_text(doc, "○ 0   ○ 1   ○ 2   ○ 3   ○ 4   ○ 5   ○ 6   ○ 7   ○ 8   ○ 9   ○ 10", after=4)
    add_question(doc, 26, "SafeMind တွင် သင်အတွက် အအသုံးဝင်ဆုံး လုပ်ဆောင်ချက်တစ်ခုမှာ အဘယ်နည်း။")
    add_long_answer(doc, 2)
    add_question(doc, 27, "SafeMind အသုံးပြုနေစဉ် အခက်အခဲ၊ မရှင်းလင်းမှု သို့မဟုတ် မမျှော်လင့်သော ရလဒ်တစ်ခုခု ရှိခဲ့ပါသလား။")
    add_long_answer(doc, 2)

    add_heading(doc, "အပိုင်း (င) — အကြံပြုချက်", 1)
    add_question(doc, 28, "SafeMind ကို ပိုမိုကောင်းမွန်စေရန် ပထမဦးဆုံး ပြင်ဆင်သင့်သည့်အရာတစ်ခုမှာ အဘယ်နည်း။")
    add_long_answer(doc, 3)
    add_question(doc, 29, "နောက်ထပ် ထည့်သွင်းလိုသော လုပ်ဆောင်ချက် သို့မဟုတ် အချက်အလက်ရှိပါသလား။")
    add_long_answer(doc, 3)
    add_question(doc, 30, "အခြား မှတ်ချက် သို့မဟုတ် အကြံပြုချက်ရှိပါက ရေးသားပါ။")
    add_long_answer(doc, 3)

    add_heading(doc, "အမည်မဖော်ဘဲ အကြံပြုချက်အသုံးပြုခွင့်", 2)
    add_question(doc, 31, "သင်ရေးသားထားသော အကြံပြုချက်ကို သုတေသနတင်ပြချက် သို့မဟုတ် SafeMind ဆိုင်ရာ အစီရင်ခံစာတွင် အမည်မဖော်ဘဲ ကိုးကားအသုံးပြုရန် ခွင့်ပြုပါသလား။")
    add_options(doc, ["ခွင့်ပြုပါသည်", "ခွင့်မပြုပါ"])

    add_text(doc, "စစ်တမ်းဖြေဆိုပေးသည့်အတွက် ကျေးဇူးတင်ပါသည်။", bold_prefix="စစ်တမ်းဖြေဆိုပေးသည့်အတွက် ကျေးဇူးတင်ပါသည်။", after=3)
    add_text(doc, "မှတ်ချက် — ဤစစ်တမ်းတွင် ကိုယ်ရေးအချက်အလက်အစစ်၊ စကားဝှက်၊ OTP၊ ဘဏ်အချက်အလက် သို့မဟုတ် အန္တရာယ်ရှိနိုင်သော လင့်ခ်များ မထည့်ပါနှင့်။", muted=True)

    core = doc.core_properties
    core.title = "SafeMind အသုံးပြုသူ စစ်တမ်း"
    core.subject = "SafeMind user research survey in Burmese"
    core.author = "SafeMind"
    core.keywords = "SafeMind, survey, Burmese, Myanmar, scam detection, user research"

    doc.save(OUT)
    print(OUT.resolve())


if __name__ == "__main__":
    build()
