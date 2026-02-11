from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors

def create_pdf():
    doc = SimpleDocTemplate(
        "due_diligence_report.pdf",
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=12,
        spaceBefore=12,
        leftIndent=0
    )
    
    subheading_style = ParagraphStyle(
        'CustomSubHeading',
        parent=styles['Heading3'],
        fontSize=12,
        textColor=colors.HexColor('#34495e'),
        spaceAfter=8,
        spaceBefore=8
    )
    
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['BodyText'],
        fontSize=10,
        alignment=TA_JUSTIFY,
        spaceAfter=8
    )
    
    alert_style = ParagraphStyle(
        'Alert',
        parent=styles['BodyText'],
        fontSize=10,
        textColor=colors.red,
        fontName='Helvetica-Bold',
        spaceAfter=8
    )
    
    # Title
    story.append(Paragraph("Investment Due Diligence Summary", title_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Metadata
    story.append(Paragraph("<b>Target:</b> Cash-based retail/service business (₱21M annual sales)", body_style))
    story.append(Paragraph("<b>Analysis Date:</b> February 9, 2026", body_style))
    story.append(Paragraph("<b>Analyst:</b> Verch (PE Fund Due Diligence)", body_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Executive Summary
    story.append(Paragraph("Executive Summary", heading_style))
    story.append(Paragraph(
        "This is a <b>HARD PASS</b> or requires immediate forensic audit before any valuation discussion. "
        "The company shows deteriorating financial controls with <b>₱26.99M (47% of total sales) unaccounted for</b> "
        "across 2022-2024. 2024 shows catastrophic collapse in deposit discipline.",
        alert_style
    ))
    story.append(Spacer(1, 0.2*inch))
    
    # Critical Red Flags
    story.append(Paragraph("Critical Red Flags", heading_style))
    
    story.append(Paragraph("1. Fraud/Embezzlement Risk - CRITICAL", subheading_style))
    story.append(Paragraph("• <b>₱13.6M missing in 2024 alone</b> (64% of sales undeposited)", body_style))
    story.append(Paragraph("• Deposit ratio collapsed from 65% (2023) to 36% (2024) despite stable sales", body_style))
    story.append(Paragraph("• Every single month in 2024 showed under-deposits — systematic pattern, not random variance", body_style))
    story.append(Paragraph("• July 2024: ₱1.61M single-month gap (76% unaccounted)", body_style))
    story.append(Paragraph("<b>Assessment:</b> This pattern screams internal theft or systematic diversion of cash.", alert_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("2. No Financial Controls", subheading_style))
    story.append(Paragraph("• No daily reconciliation evident", body_style))
    story.append(Paragraph("• No documented deposit proof/audit trail mentioned", body_style))
    story.append(Paragraph("• 'Over-deposits' in some months (2023: Aug/Sep/Oct) suggest retroactive adjustments to hide shortfalls", body_style))
    story.append(Paragraph("• Sales data exists but cash doesn't reach the bank = zero accountability", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("3. Working Capital Black Hole", subheading_style))
    story.append(Paragraph("• ₱26.99M cumulative unexplained difference = <b>1.3x annual sales</b>", body_style))
    story.append(Paragraph("• If cash isn't stolen, where is it? COGS? Undisclosed expenses? Off-book operations?", body_style))
    story.append(Paragraph("• No inventory/AP/AR context provided to explain cash burn", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("4. Management Dysfunction", subheading_style))
    story.append(Paragraph("• 2024 shows no corrective action despite worsening trend", body_style))
    story.append(Paragraph("• Report prepared by 'Maydeline del Rosario' (bookkeeper?) — no CFO/controller oversight evident", body_style))
    story.append(Paragraph("• Recommendations are basic hygiene (daily reconciliation, deposit slips) = these don't exist now", body_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Deal-Killer Questions
    story.append(Paragraph("Deal-Killer Questions", heading_style))
    
    story.append(Paragraph("1. Where is the ₱26.99M?", subheading_style))
    story.append(Paragraph("• <b>If embezzled</b> → fraud liability, potential lawsuits, criminal exposure", body_style))
    story.append(Paragraph("• <b>If legitimate expenses</b> → EBITDA is fictitious, business is cash-flow negative", body_style))
    story.append(Paragraph("• <b>If tied up in inventory/AR</b> → working capital crisis", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("2. Why did 2024 collapse?", subheading_style))
    story.append(Paragraph("• Key employee quit/fired?", body_style))
    story.append(Paragraph("• Owner health issue reducing oversight?", body_style))
    story.append(Paragraph("• Business model change (credit sales not captured)?", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("3. Are sales figures real?", subheading_style))
    story.append(Paragraph("• If deposits don't match sales, who verified the sales data?", body_style))
    story.append(Paragraph("• Could be inflated top-line to mask declining business", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("4. What's the actual profitability?", subheading_style))
    story.append(Paragraph("• No P&L, no COGS, no expense breakdown", body_style))
    story.append(Paragraph("• Reported sales mean nothing if cash doesn't materialize", body_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Valuation Impact
    story.append(Paragraph("Valuation Impact", heading_style))
    story.append(Paragraph("<b>Current asking price:</b> TBD", body_style))
    story.append(Paragraph("<b>Adjusted value:</b> ₱0 until proven otherwise", alert_style))
    story.append(Paragraph("• Cannot value a business where 47% of revenue disappears", body_style))
    story.append(Paragraph("• Enterprise value = recoverable assets (inventory, equipment, customer base) minus fraud liabilities", body_style))
    story.append(Paragraph("• Likely worth only <b>liquidation value</b> unless audit clears the ₱26.99M", body_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Page break
    story.append(PageBreak())
    
    # Mitigation Strategy
    story.append(Paragraph("Mitigation Strategy (If You Still Want This Deal)", heading_style))
    
    story.append(Paragraph("Immediate Actions (Pre-LOI)", subheading_style))
    story.append(Paragraph("<b>1. Forensic Audit</b>", body_style))
    story.append(Paragraph("Timeline: 2-3 weeks | Cost: ₱200K-500K", body_style))
    story.append(Paragraph("Scope:", body_style))
    story.append(Paragraph("• Trace ₱26.99M: bank statements, personal accounts, inventory purchases, supplier payments", body_style))
    story.append(Paragraph("• Interview staff confidentially (someone knows where the cash went)", body_style))
    story.append(Paragraph("• Review POS data vs bank deposits by day", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>2. Seller Representations & Warranties</b>", body_style))
    story.append(Paragraph("• Personal guarantee from owner for undisclosed liabilities", body_style))
    story.append(Paragraph("• Holdback 50%+ of purchase price in escrow for 24 months", body_style))
    story.append(Paragraph("• Right to clawback if fraud discovered", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>3. Staff Interviews</b>", body_style))
    story.append(Paragraph("• Meet the cashiers, bookkeeper, anyone handling money", body_style))
    story.append(Paragraph("• Assess if this is known/tolerated vs management complicity", body_style))
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("Post-Acquisition Actions (If Deal Proceeds)", subheading_style))
    story.append(Paragraph("<b>1. Install Controls Day 1</b>", body_style))
    story.append(Paragraph("• New POS system with real-time bank integration", body_style))
    story.append(Paragraph("• Daily manager reconciliation (sales vs deposits vs register count)", body_style))
    story.append(Paragraph("• Segregate duties: different people handle cash, record sales, make deposits", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>2. Replace Entire Finance Function</b>", body_style))
    story.append(Paragraph("• Bring in your own CFO/controller", body_style))
    story.append(Paragraph("• Assume current bookkeeper is compromised (complicit or incompetent)", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>3. Customer Revenue Audit</b>", body_style))
    story.append(Paragraph("• <b>If B2B:</b> verify receivables with customers", body_style))
    story.append(Paragraph("• <b>If retail:</b> install cameras on registers, mystery shoppers", body_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Financial Summary
    story.append(Paragraph("Financial Summary (2022-2024)", heading_style))
    
    data = [
        ['Year', 'Total Sales', 'Total Deposited', 'Difference', 'Deposit Ratio'],
        ['2022', '₱14,356,353', '₱8,561,101', '₱5,795,252', '60%'],
        ['2023', '₱21,813,012', '₱14,188,953', '₱7,624,059', '65%'],
        ['2024', '₱21,269,857', '₱7,672,424', '₱13,597,433', '36%'],
        ['Total', '₱57,439,222', '₱30,422,478', '₱26,999,744', '53%']
    ]
    
    table = Table(data, colWidths=[1*inch, 1.5*inch, 1.5*inch, 1.5*inch, 1.2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -2), colors.HexColor('#ecf0f1')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#bdc3c7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
    ]))
    
    story.append(table)
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("Key Observations:", subheading_style))
    story.append(Paragraph("• Sales grew 48% from 2022 to 2023 (healthy growth)", body_style))
    story.append(Paragraph("• Sales flat in 2024 (-2.5% YoY)", body_style))
    story.append(Paragraph("• Deposits <b>collapsed 46%</b> in 2024 despite stable sales", alert_style))
    story.append(Paragraph("• 2024 gap (₱13.6M) is <b>2.3x larger</b> than 2023 gap (₱7.6M)", alert_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Page break
    story.append(PageBreak())
    
    # Bottom Line
    story.append(Paragraph("Bottom Line", heading_style))
    story.append(Paragraph("Do Not Proceed Without Full Explanation of the ₱26.99M", subheading_style))
    story.append(Paragraph(
        "This isn't 'weak controls' — this is a business where half the cash vanishes. "
        "You'd be buying a liability unless the owner can prove:",
        body_style
    ))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("1. The missing cash went to legitimate business expenses (and show receipts), <b>OR</b>", body_style))
    story.append(Paragraph("2. They've already recovered the funds and prosecuted the fraudster, <b>OR</b>", body_style))
    story.append(Paragraph("3. They'll discount the purchase price by ₱26.99M + a fraud risk premium (50%+ haircut)", body_style))
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph(
        "Even then, the infrastructure to allow this level of leakage means you're buying a <b>turnaround project</b>, not a performing asset.",
        body_style
    ))
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("Investment Required for Professionalization:", subheading_style))
    story.append(Paragraph("• <b>Timeline:</b> 12-18 months", body_style))
    story.append(Paragraph("• <b>Cost:</b> ₱2-3M for systems, controls, and management team", body_style))
    story.append(Paragraph("• <b>Risk:</b> High execution risk given current state", body_style))
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("Opportunity Cost:", subheading_style))
    story.append(Paragraph("Time spent investigating this mess could be spent on cleaner deals with audited financials.", body_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Recommendation
    story.append(Paragraph("Recommendation", heading_style))
    story.append(Paragraph("<b>PASS</b> — unless seller provides:", alert_style))
    story.append(Paragraph("• Complete forensic audit results (at their expense)", body_style))
    story.append(Paragraph("• Full explanation with supporting documentation for ₱26.99M", body_style))
    story.append(Paragraph("• 50%+ purchase price discount to compensate for fraud risk and turnaround effort", body_style))
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("<b>Risk Rating:</b> ⚠️ EXTREME", alert_style))
    story.append(Paragraph("<b>Priority:</b> Low (investigate only if no better alternatives)", body_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Footer
    story.append(Paragraph(
        "<i>This analysis is based on the 'Sales vs. Deposits Summary Report (2022-2024)' prepared by Maydeline del Rosario. "
        "Additional due diligence required before making any investment decision.</i>",
        ParagraphStyle('Italic', parent=body_style, fontSize=9, textColor=colors.grey)
    ))
    
    doc.build(story)
    print("PDF generated successfully: due_diligence_report.pdf")

if __name__ == "__main__":
    create_pdf()
