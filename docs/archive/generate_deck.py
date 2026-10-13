import collections.abc
import pptx
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Anthropic Warm Color Palette
    CREAM = RGBColor(250, 248, 245)      # #FAF8F5
    CHARCOAL = RGBColor(25, 25, 25)      # #191919
    CARD_BG = RGBColor(241, 237, 228)    # #F1EDE4
    BORDER_COL = RGBColor(226, 221, 212) # #E2DDD4
    TERRACOTTA = RGBColor(210, 101, 74)  # #D2654A
    MUTED_TEXT = RGBColor(110, 104, 98)  # #6E6862
    WHITE = RGBColor(255, 255, 255)
    GREEN = RGBColor(30, 126, 52)
    DARK_CARD = RGBColor(38, 38, 38)
    DARK_BORDER = RGBColor(55, 55, 55)

    def set_slide_background(slide, color):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = color
        bg.line.color.rgb = color
        return bg

    def add_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=BORDER_COL):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = bg_color
        card.line.color.rgb = border_color
        card.line.width = Pt(1)
        return card

    # ==========================================
    # SLIDE 1: Title Slide (Warm Cream)
    # ==========================================
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1, CREAM)

    # Tag chip
    chip = add_card(s1, Inches(1.2), Inches(1.4), Inches(4.5), Inches(0.45), CARD_BG, BORDER_COL)
    tf_chip = chip.text_frame
    tf_chip.text = "DPDP ACT 2023 COMPLIANT  ·  POWERED BY IBM BOB"
    p_chip = tf_chip.paragraphs[0]
    p_chip.font.name = "Arial"
    p_chip.font.size = Pt(9)
    p_chip.font.bold = True
    p_chip.font.color.rgb = TERRACOTTA
    p_chip.alignment = PP_ALIGN.CENTER

    # Main Title
    txBox = s1.shapes.add_textbox(Inches(1.2), Inches(2.2), Inches(11.0), Inches(2.5))
    tf = txBox.text_frame
    tf.word_wrap = True
    p1 = tf.paragraphs[0]
    p1.text = "CoverAI"
    p1.font.name = "Georgia"
    p1.font.size = Pt(56)
    p1.font.bold = True
    p1.font.color.rgb = CHARCOAL

    p2 = tf.add_paragraph()
    p2.text = "Explainable AI Vehicle Insurance Claims & Policy Copilot"
    p2.font.name = "Georgia"
    p2.font.size = Pt(28)
    p2.font.color.rgb = MUTED_TEXT
    p2.space_before = Pt(12)

    # Feature Bullets in 3 Columns
    features = [
        ("Sub-Minute Triage", "Multimodal damage photo analysis & real-time clause verification"),
        ("IBM Bob Agentic Pipeline", "Deep service-layer architecture & semantic retrieval"),
        ("Statutory Data Rights", "Consent revocation, full JSON exports & 30-day right to erasure")
    ]
    for i, (title, desc) in enumerate(features):
        left = Inches(1.2 + i * 3.8)
        card = add_card(s1, left, Inches(5.0), Inches(3.5), Inches(1.6), CARD_BG, BORDER_COL)
        tf_c = card.text_frame
        tf_c.word_wrap = True
        p_t = tf_c.paragraphs[0]
        p_t.text = title
        p_t.font.name = "Georgia"
        p_t.font.size = Pt(14)
        p_t.font.bold = True
        p_t.font.color.rgb = CHARCOAL
        
        p_d = tf_c.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(11)
        p_d.font.color.rgb = MUTED_TEXT
        p_d.space_before = Pt(6)

    # ==========================================
    # SLIDE 2: Problem Statement
    # ==========================================
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_background(s2, CREAM)

    # Header
    tx = s2.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.33), Inches(1.2))
    tf = tx.text_frame
    p_tag = tf.paragraphs[0]
    p_tag.text = "THE PROBLEM"
    p_tag.font.name = "Arial"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = TERRACOTTA
    
    p_h = tf.add_paragraph()
    p_h.text = "The Broken Vehicle Insurance Claims Lifecycle in India"
    p_h.font.name = "Georgia"
    p_h.font.size = Pt(28)
    p_h.font.bold = True
    p_h.font.color.rgb = CHARCOAL

    # 3 Problem Cards
    probs = [
        ("1. Opaque & Protracted Triage", "Claims take 15 to 45 days for surveyor allocation and settlement. Policyholders face arbitrary deductions with zero transparency into clause interpretations."),
        ("2. Document Complexity & Clause Gaps", "Over 78% of vehicle owners do not understand policy deductibles, Zero Depreciation riders, or hydrostatic lock exclusions, leading to 35%+ claim rejection disputes."),
        ("3. DPDP Act Compliance Void", "With the enactment of India's DPDP Act 2023, insurers lack automated mechanisms for granular consent governance, data portability, and immutable audit trails.")
    ]
    for i, (title, desc) in enumerate(probs):
        top = Inches(2.2 + i * 1.6)
        card = add_card(s2, Inches(1.0), top, Inches(11.33), Inches(1.35), CARD_BG, BORDER_COL)
        tf_c = card.text_frame
        tf_c.word_wrap = True
        p_t = tf_c.paragraphs[0]
        p_t.text = title
        p_t.font.name = "Georgia"
        p_t.font.size = Pt(15)
        p_t.font.bold = True
        p_t.font.color.rgb = CHARCOAL
        
        p_d = tf_c.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(12)
        p_d.font.color.rgb = MUTED_TEXT
        p_d.space_before = Pt(4)

    # ==========================================
    # SLIDE 3: Solution Statement
    # ==========================================
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_background(s3, CREAM)

    tx = s3.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.33), Inches(1.2))
    tf = tx.text_frame
    p_tag = tf.paragraphs[0]
    p_tag.text = "THE SOLUTION"
    p_tag.font.name = "Arial"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = TERRACOTTA
    
    p_h = tf.add_paragraph()
    p_h.text = "CoverAI: Explainable AI & Statutory Privacy Platform"
    p_h.font.name = "Georgia"
    p_h.font.size = Pt(28)
    p_h.font.bold = True
    p_h.font.color.rgb = CHARCOAL

    solutions = [
        ("Instant Policy Ingestion", "Upload any motor policy PDF. Extracts IDV, deductibles, riders, and validity dates in < 3 seconds using OCR and semantic chunking."),
        ("Multimodal Triage Engine", "Analyzes damage photos, compares against policy clauses, and computes numerical risk scores with exact clause citations."),
        ("Interactive AI Advisor", "SSE streaming chat interface enabling policyholders to ask questions about exclusions and deductible excess in plain English."),
        ("Statutory DPDP Portal", "First-class privacy console: toggle AI consent, generate instant JSON data archives, and schedule account erasure with 30-day grace.")
    ]
    for i, (title, desc) in enumerate(solutions):
        col = i % 2
        row = i // 2
        left = Inches(1.0 + col * 5.8)
        top = Inches(2.2 + row * 2.4)
        card = add_card(s3, left, top, Inches(5.5), Inches(2.1), CARD_BG, BORDER_COL)
        tf_c = card.text_frame
        tf_c.word_wrap = True
        p_t = tf_c.paragraphs[0]
        p_t.text = title
        p_t.font.name = "Georgia"
        p_t.font.size = Pt(16)
        p_t.font.bold = True
        p_t.font.color.rgb = CHARCOAL
        
        p_d = tf_c.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(12)
        p_d.font.color.rgb = MUTED_TEXT
        p_d.space_before = Pt(6)

    # ==========================================
    # SLIDE 4: IBM Bob Technology Role
    # ==========================================
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_background(s4, CREAM)

    tx = s4.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.33), Inches(1.2))
    tf = tx.text_frame
    p_tag = tf.paragraphs[0]
    p_tag.text = "TECHNOLOGY SPOTLIGHT"
    p_tag.font.name = "Arial"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = TERRACOTTA
    
    p_h = tf.add_paragraph()
    p_h.text = "How IBM Bob Accelerated CoverAI Development"
    p_h.font.name = "Georgia"
    p_h.font.size = Pt(28)
    p_h.font.bold = True
    p_h.font.color.rgb = CHARCOAL

    bob_features = [
        ("Agentic Service-Layer Decomposition", "IBM Bob designed deep decoupled modules (ClaimService, TriageService, QAService), reducing circular route dependencies and establishing 100% type safety."),
        ("Multi-Modal Document & Vision Pipeline", "Assisted in orchestrating OCR clause extraction, image damage recognition, and JSON schema validation with fallback safety."),
        ("DPDP Statutory Workflow Automation", "Constructed background workers for Fernet AES-256 field encryption, immutable append-only audit trails, and automatic JSON data export pipelines."),
        ("Anthropic-Inspired Editorial Redesign", "Overhauled frontend design tokens (warm cream, charcoal, Playfair Display serif) across 15+ pages with zero layout code duplication.")
    ]
    for i, (title, desc) in enumerate(bob_features):
        top = Inches(2.1 + i * 1.25)
        card = add_card(s4, Inches(1.0), top, Inches(11.33), Inches(1.1), CARD_BG, BORDER_COL)
        tf_c = card.text_frame
        tf_c.word_wrap = True
        p_t = tf_c.paragraphs[0]
        p_t.text = title
        p_t.font.name = "Georgia"
        p_t.font.size = Pt(14)
        p_t.font.bold = True
        p_t.font.color.rgb = CHARCOAL
        
        p_d = tf_c.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(11)
        p_d.font.color.rgb = MUTED_TEXT
        p_d.space_before = Pt(3)

    # ==========================================
    # SLIDE 5: Architecture & Monorepo Structure
    # ==========================================
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_background(s5, CREAM)

    tx = s5.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.33), Inches(1.2))
    tf = tx.text_frame
    p_tag = tf.paragraphs[0]
    p_tag.text = "SYSTEM ARCHITECTURE"
    p_tag.font.name = "Arial"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = TERRACOTTA
    
    p_h = tf.add_paragraph()
    p_h.text = "Turborepo Monorepo & Decoupled Service Stack"
    p_h.font.name = "Georgia"
    p_h.font.size = Pt(28)
    p_h.font.bold = True
    p_h.font.color.rgb = CHARCOAL

    arch_blocks = [
        ("Frontend Application", "Next.js 14 App Router\nTailwind CSS + Anthropic Palette\nZustand State & TanStack Query\nUnified AppShell Layout Architecture", Inches(1.0)),
        ("Backend Services", "FastAPI Async ASGI Server\nClaimService & TriageService\nPostgreSQL 16 + pgvector\nPrometheus Scrape Telemetry", Inches(5.0)),
        ("Shared Packages & AI", "@coverai/shared-types (Zod)\n@coverai/ui (Capsule Primitives)\nGoogle Gemini Reasoning Engine\nFernet Field-Level Encryption", Inches(9.0))
    ]
    for title, desc, left in arch_blocks:
        card = add_card(s5, left, Inches(2.2), Inches(3.5), Inches(4.5), CARD_BG, BORDER_COL)
        tf_c = card.text_frame
        tf_c.word_wrap = True
        p_t = tf_c.paragraphs[0]
        p_t.text = title
        p_t.font.name = "Georgia"
        p_t.font.size = Pt(16)
        p_t.font.bold = True
        p_t.font.color.rgb = CHARCOAL
        
        p_d = tf_c.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(12)
        p_d.font.color.rgb = MUTED_TEXT
        p_d.space_before = Pt(14)

    # ==========================================
    # SLIDE 6: Role-Based Portals (Dark Contrast Slide)
    # ==========================================
    s6 = prs.slides.add_slide(blank_layout)
    set_slide_background(s6, CHARCOAL)

    tx = s6.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.33), Inches(1.2))
    tf = tx.text_frame
    p_tag = tf.paragraphs[0]
    p_tag.text = "MULTI-STAKEHOLDER PORTALS"
    p_tag.font.name = "Arial"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = TERRACOTTA
    
    p_h = tf.add_paragraph()
    p_h.text = "Three Unified Stakeholder Experiences"
    p_h.font.name = "Georgia"
    p_h.font.size = Pt(28)
    p_h.font.bold = True
    p_h.font.color.rgb = WHITE

    roles = [
        ("Policyholder Portal", "• Drag & drop photo evidence upload\n• Interactive Policy Vault & Deductibles\n• Real-time SSE AI Advisor chat\n• DPDP Privacy console & export archives", Inches(1.0)),
        ("Claims Officer Command", "• Live triage claims queue with risk scoring\n• Threat vector radar (late night, doc mismatch)\n• Prometheus scrape metrics gauge\n• Expandable audit log state diff explorer", Inches(5.0)),
        ("Insurance Advisor Hub", "• Client portfolio dossier management\n• Claim representation & dispute advocacy\n• Policy renewal due tracking\n• Direct customer authorization linkage", Inches(9.0))
    ]
    for title, desc, left in roles:
        card = add_card(s6, left, Inches(2.2), Inches(3.5), Inches(4.5), DARK_CARD, DARK_BORDER)
        tf_c = card.text_frame
        tf_c.word_wrap = True
        p_t = tf_c.paragraphs[0]
        p_t.text = title
        p_t.font.name = "Georgia"
        p_t.font.size = Pt(16)
        p_t.font.bold = True
        p_t.font.color.rgb = WHITE
        
        p_d = tf_c.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(12)
        p_d.font.color.rgb = RGBColor(180, 175, 168)
        p_d.space_before = Pt(12)

    # ==========================================
    # SLIDE 7: DPDP Act 2023 Compliance & Security
    # ==========================================
    s7 = prs.slides.add_slide(blank_layout)
    set_slide_background(s7, CREAM)

    tx = s7.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.33), Inches(1.2))
    tf = tx.text_frame
    p_tag = tf.paragraphs[0]
    p_tag.text = "DATA GOVERNANCE & PRIVACY"
    p_tag.font.name = "Arial"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = TERRACOTTA
    
    p_h = tf.add_paragraph()
    p_h.text = "Engineered for India's DPDP Act 2023 from Day 1"
    p_h.font.name = "Georgia"
    p_h.font.size = Pt(28)
    p_h.font.bold = True
    p_h.font.color.rgb = CHARCOAL

    dpdp_items = [
        ("Granular Consent Architecture", "Separate switches for AI analysis, marketing, and advisor sharing with real-time enforcement gating downstream APIs."),
        ("Right to Data Portability", "One-click generation of machine-readable JSON dossiers compiling user profiles, policy parameters, and claim audit trails."),
        ("Right to Erasure with 30-Day Grace", "Statutory withdrawal period with automated cancellation hooks and permanent cryptographic key shredding."),
        ("Fernet AES-256 Field Encryption", "All PII and sensitive vehicular data encrypted at rest in PostgreSQL with 7-year regulatory audit compliance.")
    ]
    for i, (title, desc) in enumerate(dpdp_items):
        col = i % 2
        row = i // 2
        left = Inches(1.0 + col * 5.8)
        top = Inches(2.2 + row * 2.3)
        card = add_card(s7, left, top, Inches(5.5), Inches(2.0), CARD_BG, BORDER_COL)
        tf_c = card.text_frame
        tf_c.word_wrap = True
        p_t = tf_c.paragraphs[0]
        p_t.text = title
        p_t.font.name = "Georgia"
        p_t.font.size = Pt(15)
        p_t.font.bold = True
        p_t.font.color.rgb = CHARCOAL
        
        p_d = tf_c.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(11)
        p_d.font.color.rgb = MUTED_TEXT
        p_d.space_before = Pt(6)

    # ==========================================
    # SLIDE 8: Business Impact & Market Traction
    # ==========================================
    s8 = prs.slides.add_slide(blank_layout)
    set_slide_background(s8, CREAM)

    tx = s8.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.33), Inches(1.2))
    tf = tx.text_frame
    p_tag = tf.paragraphs[0]
    p_tag.text = "BUSINESS VALUE & IMPACT"
    p_tag.font.name = "Arial"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = TERRACOTTA
    
    p_h = tf.add_paragraph()
    p_h.text = "Quantifiable ROI for Insurers & Policyholders"
    p_h.font.name = "Georgia"
    p_h.font.size = Pt(28)
    p_h.font.bold = True
    p_h.font.color.rgb = CHARCOAL

    stats = [
        ("90%", "Faster Triage", "Reduces initial claim assessment from 3-5 business days to under 45 seconds."),
        ("40%", "OpEx Savings", "Minimizes unnecessary on-site surveyor dispatches through visual damage validation."),
        ("35%", "Fewer Disputes", "Transparent plain-language clause explanations prevent rejection conflicts."),
        ("100%", "DPDP Ready", "Complete statutory compliance shielding insurers from regulatory penalties.")
    ]
    for i, (metric, label, desc) in enumerate(stats):
        left = Inches(1.0 + i * 2.85)
        card = add_card(s8, left, Inches(2.2), Inches(2.7), Inches(4.5), CARD_BG, BORDER_COL)
        tf_c = card.text_frame
        tf_c.word_wrap = True
        p_m = tf_c.paragraphs[0]
        p_m.text = metric
        p_m.font.name = "Georgia"
        p_m.font.size = Pt(36)
        p_m.font.bold = True
        p_m.font.color.rgb = TERRACOTTA
        
        p_l = tf_c.add_paragraph()
        p_l.text = label
        p_l.font.name = "Georgia"
        p_l.font.size = Pt(15)
        p_l.font.bold = True
        p_l.font.color.rgb = CHARCOAL
        p_l.space_before = Pt(8)
        
        p_d = tf_c.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(11)
        p_d.font.color.rgb = MUTED_TEXT
        p_d.space_before = Pt(8)

    # ==========================================
    # SLIDE 9: Conclusion & Summary
    # ==========================================
    s9 = prs.slides.add_slide(blank_layout)
    set_slide_background(s9, CREAM)

    tx = s9.shapes.add_textbox(Inches(1.5), Inches(1.5), Inches(10.33), Inches(4.5))
    tf = tx.text_frame
    tf.word_wrap = True
    
    p_tag = tf.paragraphs[0]
    p_tag.text = "CONCLUSION"
    p_tag.font.name = "Arial"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = TERRACOTTA

    p_h = tf.add_paragraph()
    p_h.text = "CoverAI: Transparent, Fast & Compliant"
    p_h.font.name = "Georgia"
    p_h.font.size = Pt(36)
    p_h.font.bold = True
    p_h.font.color.rgb = CHARCOAL
    p_h.space_before = Pt(8)

    p_sub = tf.add_paragraph()
    p_sub.text = "CoverAI combines the power of IBM Bob agentic orchestration, multimodal visual AI, and statutory DPDP 2023 compliance to build the next generation of motor insurance infrastructure."
    p_sub.font.name = "Arial"
    p_sub.font.size = Pt(14)
    p_sub.font.color.rgb = MUTED_TEXT
    p_sub.space_before = Pt(16)

    # Links Box
    link_card = add_card(s9, Inches(1.5), Inches(4.5), Inches(10.33), Inches(1.8), CARD_BG, BORDER_COL)
    tf_l = link_card.text_frame
    tf_l.word_wrap = True
    p_lh = tf_l.paragraphs[0]
    p_lh.text = "Project Links & Resources"
    p_lh.font.name = "Georgia"
    p_lh.font.size = Pt(14)
    p_lh.font.bold = True
    p_lh.font.color.rgb = CHARCOAL

    p_l1 = tf_l.add_paragraph()
    p_l1.text = "• GitHub Repository: https://github.com/aditya0si/CoverAI"
    p_l1.font.name = "Arial"
    p_l1.font.size = Pt(12)
    p_l1.font.color.rgb = CHARCOAL
    p_l1.space_before = Pt(6)

    p_l2 = tf_l.add_paragraph()
    p_l2.text = "• IBM Bob Documentation: See IBM_BOB_TECHNOLOGY.md in root"
    p_l2.font.name = "Arial"
    p_l2.font.size = Pt(12)
    p_l2.font.color.rgb = CHARCOAL
    p_l2.space_before = Pt(3)

    output_path = "CoverAI_Pitch_Deck.pptx"
    prs.save(output_path)
    print(f"Presentation saved successfully to {output_path}")

if __name__ == "__main__":
    create_deck()
