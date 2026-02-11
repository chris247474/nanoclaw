// Using officegen to create DOCX from scratch
const fs = require('fs');

// Since we don't have officegen or docx libraries, we'll create an RTF file
// which can be opened and edited in Word/LibreOffice as .docx
const rtfContent = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fswiss Arial;}{\\f1\\fmodern Courier New;}}
{\\colortbl;\\red0\\green0\\blue0;\\red44\\green62\\blue80;\\red231\\green76\\blue60;\\red40\\green167\\blue69;}

{\\pard\\qc\\b\\fs32 Investment Due Diligence Report\\par}
{\\pard\\qc\\fs24 Arandia Farm & Resort - Fire Sale Acquisition\\par}
\\par

{\\pard\\sb100\\sa100\\shading10000\\cbpat7
\\b Target:\\b0  Arandia College / Yolanda's Integrated Farm & Resort\\par
\\b Location:\\b0  Magallanes, Cavite (3.3 hectares titled land)\\par
\\b Asking Price:\\b0  ₱30,000,000 (₱20M down, ₱10M on title transfer)\\par
\\b Deal Type:\\b0  Distressed asset - seller needs cash for debt\\par
\\b Analysis Date:\\b0  February 9, 2026\\par
\\b Analyst:\\b0  Verch (PE Fund Due Diligence)\\par
\\pard\\par}

{\\pard\\sb200\\b\\fs28\\cf2 Executive Summary\\par\\pard\\par}

{\\pard\\sb100\\sa100\\shading10000\\cbpat4
\\b\\fs22 PROCEED WITH CAUTION - CONDITIONAL GREEN LIGHT\\b0\\fs20\\par
\\pard\\par}

This is a \\b land-value arbitrage play\\b0  with cash-flow optionality, not a pure operating business acquisition. The land alone is worth \\b ₱81-146M (2.7x-4.9x purchase price)\\b0 , providing exceptional downside protection. The operating business (TESDA training + livestock) generates estimated ₱3-4M EBITDA but comes with significant financial opacity and execution risk.\\par
\\par

{\\pard\\sb100\\b Key Value Drivers:\\b0\\par}
• Acquiring land at \\b ₱900/sqm\\b0  vs \\b ₱2,500-4,500/sqm\\b0  market (67-80% discount)\\par
• Operating business covers holding costs while positioning for exit\\par
• Multiple exit strategies (land flip, business sale, agri-tourism development)\\par
\\par

{\\pard\\sb100\\b Critical Risks:\\b0\\par}
• \\cf3\\b HIGH:\\b0\\cf1  Financial normalization uncertainty - seller's numbers are unreliable\\par
• \\cf3\\b HIGH:\\b0\\cf1  Political revenue dependency (22% from senatorial vouchers)\\par
• \\cf3\\b HIGH:\\b0\\cf1  Permit transferability (TESDA accreditation, environmental)\\par
• \\b MEDIUM:\\b0  Environmental compliance (piggery operations)\\par
\\par

{\\pard\\sb200\\b\\fs28\\cf2 Investment Thesis: The Asymmetric Bet\\par\\pard\\par}

{\\trowd\\trgaph100
\\cellx2000\\cellx4000\\cellx6000\\cellx8000
{\\pard\\intbl\\b Scenario\\cell}
{\\pard\\intbl\\b Value\\cell}
{\\pard\\intbl\\b Multiple\\cell}
{\\pard\\intbl\\b Probability\\cell}
\\row

\\cellx2000\\cellx4000\\cellx6000\\cellx8000
{\\pard\\intbl Downside (land-only)\\cell}
{\\pard\\intbl ₱81-97M (zonal)\\cell}
{\\pard\\intbl 2.7-3.2x\\cell}
{\\pard\\intbl High\\cell}
\\row

\\cellx2000\\cellx4000\\cellx6000\\cellx8000
{\\pard\\intbl Base case (land + ops)\\cell}
{\\pard\\intbl ₱113-146M (market)\\cell}
{\\pard\\intbl 3.8-4.9x\\cell}
{\\pard\\intbl Medium\\cell}
\\row

\\cellx2000\\cellx4000\\cellx6000\\cellx8000
{\\pard\\intbl Upside (agri-tourism)\\cell}
{\\pard\\intbl ₱150M+\\cell}
{\\pard\\intbl 5.0x+\\cell}
{\\pard\\intbl Low-Medium\\cell}
\\row
}
\\par

{\\pard\\sb200\\b\\fs28\\cf2 Exit Strategy Matrix\\par\\pard\\par}

{\\pard\\sb100\\b\\fs24 Exit Option 1: Short-Hold Land Flip (12-24 months)\\b0\\fs20\\par}
\\par
\\b Target Buyer:\\b0  Real estate developer, agri-tourism investor\\par
\\b Target Price:\\b0  ₱100-130M (zonal to market value)\\par
\\b Gross Return:\\b0  3.3-4.3x\\par
\\b IRR (18-month hold):\\b0  \\f1\\b 80-120%\\b0\\f0\\par
\\b Execution Risk:\\b0  \\cf4 LOW - land value is established\\cf1\\par
\\par

\\b Catalysts:\\b0\\par
• Market property to institutional buyers\\par
• Offer seller financing to accelerate sale\\par
• Package with development plans (resort concept)\\par
• Target Manila-based developers expanding to Cavite\\par
\\par

\\b Holding Costs:\\b0\\par
• Property tax: ₱200-300K/year (agricultural rate)\\par
• Security/caretaker: ₱180K/year\\par
• Maintenance: ₱100K/year\\par
• \\b Total: ₱480-580K/year\\b0\\par
• Covered by minimal operations (livestock, crops)\\par
\\par

{\\pard\\sb100\\shading10000\\cbpat4
\\b Recommended for:\\b0  Quick capital recycling, conservative risk tolerance\\par
\\b Cash-on-Cash Return:\\b0  3.3-4.3x in 18 months = 180-330% absolute return\\par
\\b Strategy:\\b0  Minimal operations to cover holding costs, focus on land marketing\\par
\\pard\\par}
\\par

{\\pard\\sb100\\b\\fs24 Exit Option 2: Medium-Hold Business Sale (24-36 months)\\b0\\fs20\\par}
\\par
\\b Target Buyer:\\b0  TESDA operator, agricultural training institution, SME investor\\par
\\b Target Price:\\b0  ₱50-70M (land + professionalized business at 5-7x EBITDA)\\par
\\b Gross Return:\\b0  1.7-2.3x\\par
\\b IRR (30-month hold):\\b0  \\f1\\b 25-35%\\b0\\f0\\par
\\b Execution Risk:\\b0  MEDIUM - requires operational stabilization\\par
\\par

\\b Value-Add Activities:\\b0\\par
\\par
\\b Year 1: Stabilization (₱1.9M investment)\\b0\\par
• Secure key staff, install financial controls\\par
• Renew/transfer all permits\\par
• Environmental remediation (piggery compliance)\\par
• Achieve first 12 months of clean financials\\par
\\par

\\b Year 2: Professionalization (₱1.5M investment)\\b0\\par
• Hire external accountant, prepare audited statements\\par
• Expand TESDA programs (apply for new accreditations)\\par
• Secure 3-year TESDA contracts (reduce political dependency)\\par
• Optimize livestock cycles for consistent cash flow\\par
\\par

\\b Year 3: Exit Prep\\b0\\par
• Document all SOPs, create operations manual\\par
• Train replacement management team\\par
• Market to strategic buyers (training institutions, SME funds)\\par
\\par

\\b EBITDA Progression:\\b0\\par
• Year 1: ₱2.0M (stabilization)\\par
• Year 2: ₱4.5M (normalized operations)\\par
• Year 3: ₱5.5M (optimized, exit-ready)\\par
\\par

\\b Exit Valuation (Year 3):\\b0\\par
• Land: ₱130M (market value post-improvements)\\par
• Business: ₱27.5M (5x ₱5.5M EBITDA)\\par
• \\b Total EV: ₱157.5M\\b0\\par
\\par

{\\pard\\sb100\\shading10000\\cbpat7
\\b Recommended for:\\b0  Operational expertise, value-add focus\\par
\\b Total Investment:\\b0  ₱30M purchase + ₱3-4M capex = ₱33-34M all-in\\par
\\b 3-Year IRR:\\b0  60-75% (with operational improvements)\\par
\\b Key Risk:\\b0  Business stabilization takes longer than expected\\par
\\pard\\par}
\\par

{\\pard\\sb100\\b\\fs24 Exit Option 3: Long-Hold Agri-Tourism Development (36-60 months)\\b0\\fs20\\par}
\\par
\\b Target Buyer:\\b0  Hospitality group, eco-resort operator\\par
\\b Target Price:\\b0  ₱190-210M (developed resort + ongoing operations)\\par
\\b Gross Return:\\b0  3.8-4.2x\\par
\\b IRR (48-month hold):\\b0  \\f1\\b 35-50%\\b0\\f0\\par
\\b Execution Risk:\\b0  \\cf3 HIGH - requires capex, permits, market risk\\cf1\\par
\\par

\\b Development Plan:\\b0\\par
\\par
\\b Phase 1 (Year 1-2): ₱8-12M investment\\b0\\par
• Obtain commercial zoning + environmental permits\\par
• Develop resort infrastructure:\\par
  - Swimming pools using river water (₱3-5M)\\par
  - Guest accommodations (10-15 rooms, ₱4-6M)\\par
  - Restaurant/function hall (₱2-3M)\\par
• Landscape improvements, parking, signage\\par
\\par

\\b Phase 2 (Year 2-3): ₱10-15M investment\\b0\\par
• Expand accommodations (20-30 rooms total)\\par
• Adventure/recreation facilities (zipline, ATV, kayaking)\\par
• Farm-to-table restaurant upgrade\\par
• Event spaces (weddings, corporate retreats)\\par
\\par

\\b Revenue Model (Stabilized Year 4):\\b0\\par
• Accommodations: ₱6-8M/year (70% occupancy)\\par
• Restaurant/F&B: ₱4-6M/year\\par
• Events/functions: ₱3-5M/year\\par
• TESDA training: ₱2-3M/year (existing business)\\par
• Adventure/recreation: ₱1-2M/year\\par
• \\b Total projected revenue: ₱16-24M/year\\b0\\par
• \\b Projected EBITDA: ₱8-12M/year\\b0  (50% margin)\\par
\\par

\\b Exit Valuation (Year 4):\\b0\\par
• Land (developed): ₱150M\\par
• Business: ₱40-60M (5-7x EBITDA)\\par
• \\b Total EV: ₱190-210M\\b0\\par
\\par

{\\pard\\sb100\\shading10000\\cbpat6
\\b Recommended for:\\b0  Hospitality experience, high capex tolerance\\par
\\b Total Investment:\\b0  ₱30M purchase + ₱20-30M development = ₱50-60M all-in\\par
\\b 4-Year IRR:\\b0  35-50% (if execution goes to plan)\\par
\\b Critical Success Factors:\\b0  Secure permits BEFORE construction, phase capex\\par
\\pard\\par}
\\par

{\\pard\\sb100\\b\\fs24 Exit Option 4: Hybrid - Partial Selldown (12-24 months)\\b0\\fs20\\par}
\\par
\\b Strategy:\\b0  Subdivide 3.3 hectares into 3-5 parcels, sell 1-2 parcels to recover capital, hold remainder\\par
\\par

\\b Subdivision Options:\\b0\\par
• \\b Option A:\\b0  3-Parcel Split\\par
  - Parcel 1: 1.0 ha (front, road access) - ₱40-50M\\par
  - Parcel 2: 1.3 ha (middle, buildings) - Hold\\par
  - Parcel 3: 1.0 ha (back, river access) - ₱40-50M\\par
\\par
• \\b Option B:\\b0  5-Parcel Split\\par
  - 5 lots of 6,500 sqm @ ₱3,500-4,000/sqm = ₱22-26M per lot\\par
  - Sell 2 lots (₱44-52M) → recover capital\\par
  - Hold 3 lots (₱66-78M value) + business for free\\par
\\par

\\b Net Position After Selldown:\\b0\\par
• Sell 1 hectare at market: ₱40-50M proceeds\\par
• Recover full capital (₱30M + ₱1M costs)\\par
• Retain 2.3 hectares (₱73-104M value) + operating business\\par
• \\b IRR: Infinite (zero capital at risk post-selldown)\\b0\\par
\\par

{\\pard\\sb100\\shading10000\\cbpat4
\\b Recommended for:\\b0  Risk mitigation, capital recovery + upside\\par
\\b Key Benefits:\\b0  Recover 100% capital in 12-24mo, retain majority land + business at zero cost\\par
\\b Best Use Case:\\b0  If DD reveals higher risks, provides fast capital recovery\\par
\\pard\\par}
\\par
\\page

{\\pard\\sb200\\b\\fs28\\cf2 Exit Strategy Comparison Matrix\\par\\pard\\par}

{\\trowd\\trgaph100
\\cellx1500\\cellx2500\\cellx3500\\cellx4500\\cellx5500\\cellx6500\\cellx7500\\cellx9000
{\\pard\\intbl\\b Strategy\\cell}
{\\pard\\intbl\\b Hold\\cell}
{\\pard\\intbl\\b Investment\\cell}
{\\pard\\intbl\\b Exit Value\\cell}
{\\pard\\intbl\\b Return\\cell}
{\\pard\\intbl\\b IRR\\cell}
{\\pard\\intbl\\b Risk\\cell}
{\\pard\\intbl\\b Best For\\cell}
\\row

\\cellx1500\\cellx2500\\cellx3500\\cellx4500\\cellx5500\\cellx6500\\cellx7500\\cellx9000
{\\pard\\intbl Land Flip\\cell}
{\\pard\\intbl 12-24mo\\cell}
{\\pard\\intbl ₱30-31M\\cell}
{\\pard\\intbl ₱100-130M\\cell}
{\\pard\\intbl 3.3-4.3x\\cell}
{\\pard\\intbl 80-120%\\cell}
{\\pard\\intbl \\cf4 LOW\\cf1\\cell}
{\\pard\\intbl Quick capital recycling\\cell}
\\row

\\cellx1500\\cellx2500\\cellx3500\\cellx4500\\cellx5500\\cellx6500\\cellx7500\\cellx9000
{\\pard\\intbl Business\\cell}
{\\pard\\intbl 24-36mo\\cell}
{\\pard\\intbl ₱33-34M\\cell}
{\\pard\\intbl ₱150-160M\\cell}
{\\pard\\intbl 4.5-4.7x\\cell}
{\\pard\\intbl 60-75%\\cell}
{\\pard\\intbl MEDIUM\\cell}
{\\pard\\intbl Operational expertise\\cell}
\\row

\\cellx1500\\cellx2500\\cellx3500\\cellx4500\\cellx5500\\cellx6500\\cellx7500\\cellx9000
{\\pard\\intbl Agri-Tourism\\cell}
{\\pard\\intbl 36-60mo\\cell}
{\\pard\\intbl ₱50-60M\\cell}
{\\pard\\intbl ₱190-210M\\cell}
{\\pard\\intbl 3.8-4.2x\\cell}
{\\pard\\intbl 35-50%\\cell}
{\\pard\\intbl \\cf3 HIGH\\cf1\\cell}
{\\pard\\intbl Hospitality experience\\cell}
\\row

\\cellx1500\\cellx2500\\cellx3500\\cellx4500\\cellx5500\\cellx6500\\cellx7500\\cellx9000
{\\pard\\intbl Selldown\\cell}
{\\pard\\intbl 12-24mo\\cell}
{\\pard\\intbl ₱31M\\cell}
{\\pard\\intbl ₱130-170M\\cell}
{\\pard\\intbl 4.2-5.5x\\cell}
{\\pard\\intbl Variable\\cell}
{\\pard\\intbl MEDIUM\\cell}
{\\pard\\intbl Risk mitigation\\cell}
\\row
}
\\par

{\\pard\\sb200\\b\\fs28\\cf2 Recommended Offer Structure\\par\\pard\\par}

{\\pard\\sb100\\shading10000\\cbpat4
\\b\\fs24 Offer: ₱28,000,000\\b0\\fs20\\par
\\par
\\b Payment Terms:\\b0\\par
• ₱15M on signing (subject to DD approval)\\par
• ₱8M on clean title transfer + TESDA confirmation\\par
• ₱5M holdback (18-month escrow) for warranty claims\\par
\\par
\\b Conditions Precedent:\\b0\\par
• Clean title + zoning confirmation\\par
• TESDA accreditation verified as transferable\\par
• Environmental audit passes OR seller remediates\\par
• Seller provides 3 years bank statements + ITRs\\par
• Easement rights legally confirmed\\par
• Independent appraisal ≥₱60M (2x minimum)\\par
\\par
\\b Walk-Away Triggers:\\b0\\par
• Title defects >₱2M to cure\\par
• Independent appraisal <₱60M\\par
• TESDA non-transferable + no senatorial vouchers\\par
• Environmental violations requiring shutdown\\par
\\pard\\par}
\\par

{\\pard\\sb200\\b\\fs28\\cf2 Bottom Line Recommendation\\par\\pard\\par}

{\\pard\\sb100\\shading10000\\cbpat4
\\b\\fs24 Investment Decision: PROCEED - TIER 2 PRIORITY\\b0\\fs20\\par
\\pard\\par}

\\b Deal-Making Factors:\\b0\\par
• Exceptional land value arbitrage (2.7-4.9x return on land alone)\\par
• Downside protection (even worst case returns 2.7x)\\par
• Multiple exit paths (land flip, business sale, agri-tourism, selldown)\\par
• Seller distress suggests negotiating leverage\\par
• Cash-flow optionality if business works\\par
\\par

\\b Risk Factors:\\b0\\par
• Financial opacity - seller's numbers unreliable\\par
• Political revenue dependency (22% from senator)\\par
• Permit transferability uncertainty\\par
• Environmental liability (piggery violations)\\par
• Operational complexity (6-12mo stabilization)\\par
\\par

\\b Net Assessment:\\b0\\par
This is a \\b land play with business hedge\\b0 , not a business acquisition. Paying ₱30M for ₱81-146M of land. Operating business is free optionality.\\par
\\par

{\\pard\\sb100\\shading10000\\cbpat7
\\b Expected Return (Conservative):\\b0\\par
• Exit Year 3 at ₱130M (land-led sale)\\par
• Gross return: 3.9-4.3x on ₱30-33M all-in\\par
• 3-year IRR: 60-75%\\par
\\pard\\par}
\\par

{\\pard\\sb200\\b\\fs28\\cf2 Next Steps\\par\\pard\\par}

\\b Week 1:\\b0  Engage counsel (₱150K), draft LOI at ₱28M (72-hour response)\\par
\\b Week 2-6:\\b0  Execute DD (legal, financial, environmental, market) - ₱500-800K budget\\par
\\b Week 7:\\b0  Go/No-Go decision based on DD findings\\par
\\b Week 8-10:\\b0  Closing (if approved) - ₱15M down, initiate 100-day plan\\par
\\par

{\\pard\\sb100\\shading10000\\cbpat6
\\b Budget Summary:\\b0\\par
• Purchase price: ₱28M (negotiated from ₱30M)\\par
• DD costs: ₱500-800K\\par
• 100-day plan: ₱1.9M\\par
• Contingency: ₱2-3M\\par
• \\b Total all-in: ₱32-34M\\b0\\par
\\par
\\b Target minimum return:\\b0  3x in 24 months (₱96M+)\\par
\\pard\\par}
\\par

{\\pard\\qc\\fs16\\i
Report prepared by: Verch (PE Fund Due Diligence)\\par
Date: February 9, 2026\\par
Confidential: Internal use only\\par
\\par
\\b FINAL VERDICT: PROCEED TO DD WITH ₱28M OFFER\\b0\\par
\\pard\\i0\\par}

}`;

// Write RTF file
fs.writeFileSync('arrandia_farm_dd_report.rtf', rtfContent);
console.log('RTF file created - can be opened as DOCX in Word/LibreOffice');

// Also create a plain markdown version with better formatting
const mdContent = fs.readFileSync('arrandia_farm_dd_report.md', 'utf8');

// Create a simple text version that Word can import
const txtContent = `INVESTMENT DUE DILIGENCE REPORT
Arandia Farm & Resort - Fire Sale Acquisition

TARGET: Arandia College / Yolanda's Integrated Farm & Resort
LOCATION: Magallanes, Cavite (3.3 hectares titled land)
ASKING PRICE: ₱30,000,000 (₱20M down, ₱10M on title transfer)
DEAL TYPE: Distressed asset - seller needs cash for debt
ANALYSIS DATE: February 9, 2026
ANALYST: Verch (PE Fund Due Diligence)

═══════════════════════════════════════════════════════════════

EXECUTIVE SUMMARY

⚠️ PROCEED WITH CAUTION - CONDITIONAL GREEN LIGHT

This is a LAND-VALUE ARBITRAGE PLAY with cash-flow optionality, not a pure operating business acquisition. The land alone is worth ₱81-146M (2.7x-4.9x purchase price), providing exceptional downside protection.

KEY VALUE DRIVERS:
✓ Acquiring land at ₱900/sqm vs ₱2,500-4,500/sqm market (67-80% discount)
✓ Operating business covers holding costs while positioning for exit
✓ Multiple exit strategies (land flip, business sale, agri-tourism development)

CRITICAL RISKS:
⚠️ HIGH: Financial normalization uncertainty - seller's numbers are unreliable
⚠️ HIGH: Political revenue dependency (22% from senatorial vouchers)
⚠️ HIGH: Permit transferability (TESDA accreditation, environmental)
⚠️ MEDIUM: Environmental compliance (piggery operations)

═══════════════════════════════════════════════════════════════

INVESTMENT THESIS: THE ASYMMETRIC BET

Scenario                          Value           Multiple    Probability
────────────────────────────────────────────────────────────────────────
Downside (land-only liquidation)  ₱81-97M (zonal)    2.7-3.2x    High
Base case (land + stabilized ops) ₱113-146M (market) 3.8-4.9x    Medium
Upside (agri-tourism development) ₱150M+             5.0x+       Low-Medium

💡 Risk-Adjusted Return: Even in distressed liquidation at zonal value, you're looking at 2.7x+ return. This is NOT a typical SME acquisition risk profile.

═══════════════════════════════════════════════════════════════

EXIT STRATEGY MATRIX

┌─────────────────────────────────────────────────────────────┐
│ EXIT OPTION 1: SHORT-HOLD LAND FLIP (12-24 MONTHS)        │
└─────────────────────────────────────────────────────────────┘

Target Buyer: Real estate developer, agri-tourism investor
Target Price: ₱100-130M (zonal to market value)
Gross Return: 3.3-4.3x
IRR (18-month hold): 80-120% ⭐⭐⭐
Execution Risk: LOW ✓

CATALYSTS:
• Market property to institutional buyers
• Offer seller financing to accelerate sale
• Package with development plans (resort concept)
• Target Manila-based developers expanding to Cavite

HOLDING COSTS:
• Property tax: ₱200-300K/year (agricultural rate)
• Security/caretaker: ₱180K/year
• Maintenance: ₱100K/year
• TOTAL: ₱480-580K/year (covered by minimal operations)

✅ RECOMMENDED FOR: Quick capital recycling, conservative risk tolerance
💰 CASH-ON-CASH RETURN: 3.3-4.3x in 18 months = 180-330% absolute return
📋 STRATEGY: Minimal operations to cover holding costs, focus on land marketing

┌─────────────────────────────────────────────────────────────┐
│ EXIT OPTION 2: MEDIUM-HOLD BUSINESS SALE (24-36 MONTHS)   │
└─────────────────────────────────────────────────────────────┘

Target Buyer: TESDA operator, agricultural training institution, SME investor
Target Price: ₱150-160M (land + professionalized business)
Gross Return: 4.5-4.7x
IRR (30-month hold): 60-75% ⭐⭐
Execution Risk: MEDIUM

VALUE-ADD ACTIVITIES:

Year 1: Stabilization (₱1.9M investment)
• Secure key staff, install financial controls
• Renew/transfer all permits
• Environmental remediation (piggery compliance)
• Achieve first 12 months of clean financials

Year 2: Professionalization (₱1.5M investment)
• Hire external accountant, prepare audited statements
• Expand TESDA programs (apply for new accreditations)
• Secure 3-year TESDA contracts (reduce political dependency)
• Optimize livestock cycles for consistent cash flow

Year 3: Exit Prep
• Document all SOPs, create operations manual
• Train replacement management team
• Market to strategic buyers

EBITDA PROGRESSION:
• Year 1: ₱2.0M (stabilization)
• Year 2: ₱4.5M (normalized operations)
• Year 3: ₱5.5M (optimized, exit-ready)

EXIT VALUATION (Year 3):
• Land: ₱130M (market value post-improvements)
• Business: ₱27.5M (5x ₱5.5M EBITDA)
• TOTAL EV: ₱157.5M

✅ RECOMMENDED FOR: Operational expertise, value-add focused investors
💰 TOTAL INVESTMENT: ₱30M purchase + ₱3-4M capex = ₱33-34M all-in
📈 3-YEAR IRR: 60-75% (accounting for operational improvements)
⚠️ KEY RISK: Business stabilization takes longer than expected

┌─────────────────────────────────────────────────────────────┐
│ EXIT OPTION 3: LONG-HOLD AGRI-TOURISM (36-60 MONTHS)      │
└─────────────────────────────────────────────────────────────┘

Target Buyer: Hospitality group, eco-resort operator
Target Price: ₱190-210M (developed resort + ongoing operations)
Gross Return: 3.8-4.2x
IRR (48-month hold): 35-50% ⭐
Execution Risk: HIGH ⚠️

DEVELOPMENT PLAN:

Phase 1 (Year 1-2): ₱8-12M investment
• Obtain commercial zoning + environmental permits
• Swimming pools using river water (₱3-5M)
• Guest accommodations (10-15 rooms, ₱4-6M)
• Restaurant/function hall (₱2-3M)
• Landscape improvements, parking, signage

Phase 2 (Year 2-3): ₱10-15M investment
• Expand accommodations (20-30 rooms total)
• Adventure/recreation facilities (zipline, ATV, kayaking)
• Farm-to-table restaurant upgrade
• Event spaces (weddings, corporate retreats)

REVENUE MODEL (Stabilized Year 4):
• Accommodations: ₱6-8M/year (70% occupancy)
• Restaurant/F&B: ₱4-6M/year
• Events/functions: ₱3-5M/year
• TESDA training: ₱2-3M/year (existing)
• Adventure/recreation: ₱1-2M/year
• TOTAL PROJECTED REVENUE: ₱16-24M/year
• PROJECTED EBITDA: ₱8-12M/year (50% margin)

EXIT VALUATION (Year 4):
• Land (developed): ₱150M
• Business: ₱40-60M (5-7x EBITDA)
• TOTAL EV: ₱190-210M

✅ RECOMMENDED FOR: Hospitality experience, high capex tolerance, longer hold
💰 TOTAL INVESTMENT: ₱30M purchase + ₱20-30M development = ₱50-60M all-in
📈 4-YEAR IRR: 35-50% (if execution goes to plan)
⚠️ CRITICAL SUCCESS FACTORS: Secure ALL permits BEFORE construction, phase capex

┌─────────────────────────────────────────────────────────────┐
│ EXIT OPTION 4: HYBRID - PARTIAL SELLDOWN (12-24 MONTHS)   │
└─────────────────────────────────────────────────────────────┘

STRATEGY: Subdivide 3.3 hectares into 3-5 parcels, sell 1-2 to recover capital, hold remainder

SUBDIVISION OPTIONS:

Option A: 3-Parcel Split
• Parcel 1: 1.0 ha (front, road access) - SELL for ₱40-50M
• Parcel 2: 1.3 ha (middle, buildings) - HOLD
• Parcel 3: 1.0 ha (back, river access) - SELL for ₱40-50M

Option B: 5-Parcel Split
• 5 lots of 6,500 sqm @ ₱3,500-4,000/sqm = ₱22-26M per lot
• Sell 2 lots (₱44-52M) → recover capital
• Hold 3 lots (₱66-78M value) + business for FREE

NET POSITION AFTER SELLDOWN:
Scenario 1: Sell 1 hectare at market
• Proceeds: ₱40-50M
• Recover: ₱30M purchase + ₱1M costs = FULL CAPITAL RECOVERY
• Retain: 2.3 hectares (₱73-104M value) + operating business
• IRR: INFINITE (zero capital at risk post-selldown) ⭐⭐⭐

Scenario 2: Sell 2 hectares at market
• Proceeds: ₱80-100M
• Net profit: ₱50-70M (1.7-2.3x return)
• Retain: 1.3 hectares (₱40-58M value) + operating business
• Total value: ₱130-170M from ₱30M investment

✅ RECOMMENDED FOR: Risk mitigation, capital recovery, maintaining upside
💡 KEY BENEFITS: Recover 100% capital in 12-24mo, retain majority land + business at zero cost
🎯 BEST USE CASE: If DD reveals higher risks, provides fast capital recovery while keeping upside

═══════════════════════════════════════════════════════════════

EXIT STRATEGY COMPARISON MATRIX

Strategy      Hold    Investment  Exit Value  Return   IRR      Risk    Best For
──────────────────────────────────────────────────────────────────────────────────
Land Flip     12-24mo ₱30-31M     ₱100-130M   3.3-4.3x 80-120%  LOW     Quick capital
Business Sale 24-36mo ₱33-34M     ₱150-160M   4.5-4.7x 60-75%   MEDIUM  Operational
Agri-Tourism  36-60mo ₱50-60M     ₱190-210M   3.8-4.2x 35-50%   HIGH    Hospitality
Partial Sell  12-24mo ₱31M        ₱130-170M   4.2-5.5x Variable MEDIUM  Risk mitigation

═══════════════════════════════════════════════════════════════

RECOMMENDED OFFER STRUCTURE

💵 OFFER: ₱28,000,000

PAYMENT TERMS:
• ₱15M on signing (subject to DD approval)
• ₱8M on clean title transfer + TESDA confirmation
• ₱5M holdback (18-month escrow) for warranty claims

CONDITIONS PRECEDENT:
✓ Clean title + zoning confirmation (no liens >₱1M)
✓ TESDA accreditation verified as transferable
✓ Environmental audit passes OR seller remediates
✓ Seller provides 3 years bank statements + ITRs
✓ Easement rights legally confirmed
✓ Independent appraisal ≥₱60M (2x minimum)

WALK-AWAY TRIGGERS:
❌ Title defects >₱2M to cure
❌ Independent appraisal <₱60M (renegotiate to ₱20-22M)
❌ TESDA non-transferable + no senatorial vouchers
❌ Environmental violations requiring shutdown

═══════════════════════════════════════════════════════════════

BOTTOM LINE RECOMMENDATION

🟢 INVESTMENT DECISION: PROCEED - TIER 2 PRIORITY

DEAL-MAKING FACTORS (PROS):
✓ Exceptional land value arbitrage (2.7-4.9x return on land alone)
✓ Downside protection (even worst case returns 2.7x)
✓ Multiple exit paths (land flip, business sale, agri-tourism, selldown)
✓ Seller distress suggests negotiating leverage
✓ Cash-flow optionality if business works

RISK FACTORS (CONS):
⚠️ Financial opacity - seller's numbers are unreliable
⚠️ Political revenue dependency (22% from senator's vouchers)
⚠️ Permit transferability uncertainty
⚠️ Environmental liability (piggery violations)
⚠️ Operational complexity (6-12 month stabilization)

NET ASSESSMENT:
This is a LAND PLAY WITH BUSINESS HEDGE, not a business acquisition. You're paying ₱30M for ₱81-146M of land. The operating business is free optionality - if it works, great (₱3-5M EBITDA). If it doesn't, you still have 2.7x+ return on land.

💰 EXPECTED RETURN (CONSERVATIVE):
• Exit Year 3 at ₱130M (land-led sale)
• Gross return: 3.9-4.3x on ₱30-33M all-in
• 3-year IRR: 60-75%

═══════════════════════════════════════════════════════════════

NEXT STEPS (IMMEDIATE ACTIONS)

WEEK 1: Pre-DD Setup
• Engage counsel (₱150K retainer)
• Draft LOI at ₱28M with 72-hour response deadline

WEEK 2-6: Execute DD
• Legal & title verification
• Financial & operational validation
• Environmental & permits audit
• Market validation
• Budget: ₱500-800K

WEEK 7: Go/No-Go Decision
• DD synthesis, investment memo
• Red flag review, valuation adjustment
• Final binding offer

WEEK 8-10: Closing (if approved)
• SPA finalization
• Escrow setup
• Title transfer
• Release ₱15M down payment
• Initiate 100-day plan

BUDGET SUMMARY:
• Purchase price: ₱28M (negotiated from ₱30M)
• DD costs: ₱500-800K
• 100-day plan: ₱1.9M
• Contingency: ₱2-3M (environmental, permits, staff)
• TOTAL ALL-IN: ₱32-34M

TARGET MINIMUM RETURN: 3x in 24 months (₱96M+) to justify risk-adjusted capital allocation

═══════════════════════════════════════════════════════════════

Report prepared by: Verch (PE Fund Due Diligence)
Date: February 9, 2026
Confidential: Internal use only, not for seller distribution

🎯 FINAL VERDICT: PROCEED TO DD WITH ₱28M OFFER

This deal has exceptional risk-adjusted returns driven by land value arbitrage. 
The operating business is a bonus, not the thesis. Biggest risks are financial 
opacity and permit transferability, both mitigable through structured DD and 
deal terms. Recommend moving to LOI submission within 72 hours to test seller's 
distress level and negotiating posture.

═══════════════════════════════════════════════════════════════`;

fs.writeFileSync('arrandia_farm_dd_report.txt', txtContent);
console.log('TXT file created - can be imported to Word');

