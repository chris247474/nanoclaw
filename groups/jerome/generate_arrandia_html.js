const fs = require('fs');

const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page { size: A4; margin: 1.5cm; }
        body {
            font-family: 'Helvetica', Arial, sans-serif;
            line-height: 1.5;
            color: #2c3e50;
            max-width: 900px;
            margin: 0 auto;
            font-size: 10pt;
        }
        h1 {
            color: #1a1a1a;
            font-size: 22px;
            margin-bottom: 5px;
            border-bottom: 3px solid #27ae60;
            padding-bottom: 8px;
        }
        h2 {
            color: #27ae60;
            font-size: 16px;
            margin-top: 20px;
            margin-bottom: 12px;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 5px;
        }
        h3 {
            color: #16a085;
            font-size: 13px;
            margin-top: 12px;
            margin-bottom: 8px;
        }
        h4 {
            color: #34495e;
            font-size: 11px;
            margin-top: 10px;
            margin-bottom: 6px;
        }
        .metadata {
            background: #e8f8f5;
            padding: 12px;
            border-left: 4px solid #27ae60;
            margin-bottom: 15px;
            font-size: 9pt;
        }
        .alert-green {
            background: #d5f4e6;
            border-left: 4px solid #27ae60;
            padding: 12px;
            margin: 12px 0;
            font-weight: bold;
        }
        .alert-yellow {
            background: #fff9e6;
            border-left: 4px solid #f39c12;
            padding: 12px;
            margin: 12px 0;
        }
        .alert-red {
            background: #fee;
            border-left: 4px solid #e74c3c;
            padding: 12px;
            margin: 12px 0;
            font-weight: bold;
        }
        ul, ol {
            margin: 8px 0;
            padding-left: 22px;
        }
        li {
            margin: 4px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 9pt;
        }
        th {
            background: #27ae60;
            color: white;
            padding: 8px;
            text-align: left;
            font-size: 9pt;
        }
        td {
            border: 1px solid #ddd;
            padding: 6px;
        }
        tr:nth-child(even) {
            background: #f8f9fa;
        }
        tr:last-child {
            background: #d5f4e6;
            font-weight: bold;
        }
        .page-break {
            page-break-after: always;
        }
        strong {
            color: #16a085;
        }
        .footer {
            margin-top: 25px;
            padding-top: 15px;
            border-top: 1px solid #bdc3c7;
            font-size: 8pt;
            color: #7f8c8d;
            font-style: italic;
        }
        .highlight {
            background: #fff9e6;
            padding: 2px 5px;
            border-radius: 3px;
        }
        .section-summary {
            background: #ecf0f1;
            padding: 10px;
            margin: 10px 0;
            border-left: 3px solid #95a5a6;
            font-size: 9pt;
        }
    </style>
</head>
<body>
    <h1>Investment Due Diligence Report</h1>
    <h2 style="margin-top: 0; color: #16a085;">Arandia Farm & Resort - Fire Sale Acquisition</h2>
    
    <div class="metadata">
        <strong>Target:</strong> Arandia College / Yolanda's Integrated Farm & Resort<br>
        <strong>Location:</strong> Magallanes, Cavite (3.3 hectares titled land)<br>
        <strong>Asking Price:</strong> ₱30,000,000 (₱20M down, ₱10M on title transfer)<br>
        <strong>Deal Type:</strong> Distressed asset - seller needs cash for debt<br>
        <strong>Analysis Date:</strong> February 9, 2026<br>
        <strong>Analyst:</strong> Verch (PE Fund Due Diligence)
    </div>

    <h2>Executive Summary</h2>
    <div class="alert-green">
        <strong>PROCEED WITH CAUTION - CONDITIONAL GREEN LIGHT</strong>
    </div>
    
    <p>This is a <strong>land-value arbitrage play</strong> with cash-flow optionality, not a pure operating business acquisition. The land alone is worth <strong>₱81-146M (2.7x-4.9x purchase price)</strong>, providing exceptional downside protection. The operating business (TESDA training + livestock) generates estimated ₱3-4M EBITDA but comes with <strong>significant financial opacity and execution risk</strong>.</p>

    <div class="section-summary">
        <strong>Key value drivers:</strong><br>
        • Acquiring land at ₱900/sqm vs ₱2,500-4,500/sqm market (67-80% discount)<br>
        • Operating business covers holding costs while positioning for exit<br>
        • Multiple exit strategies (land flip, business sale, agri-tourism development)
    </div>

    <p><strong>Critical risks:</strong> Financial normalization uncertainty, permit transferability, environmental compliance (piggery), political revenue dependency (senatorial vouchers).</p>

    <h2>Investment Thesis: The Asymmetric Bet</h2>

    <table>
        <tr>
            <th>Scenario</th>
            <th>Value</th>
            <th>Multiple on ₱30M</th>
            <th>Probability</th>
        </tr>
        <tr>
            <td><strong>Downside</strong> (land-only liquidation)</td>
            <td>₱81-97M (zonal)</td>
            <td>2.7-3.2x</td>
            <td>High</td>
        </tr>
        <tr>
            <td><strong>Base case</strong> (land + stabilized ops)</td>
            <td>₱113-146M (market)</td>
            <td>3.8-4.9x</td>
            <td>Medium</td>
        </tr>
        <tr>
            <td><strong>Upside</strong> (agri-tourism development)</td>
            <td>₱150M+</td>
            <td>5.0x+</td>
            <td>Low-Medium</td>
        </tr>
    </table>

    <p><strong>Risk-adjusted return:</strong> Even in a distressed liquidation scenario (land-only sale at zonal value), you're looking at <span class="highlight">2.7x+ return</span>. This is NOT a typical SME acquisition risk profile.</p>

    <h2>Asset Valuation Breakdown</h2>

    <h3>Land Valuation</h3>
    <p><strong>Property specs:</strong> 3.3 hectares (32,474 sqm) titled land, 111m road frontage, cemented access, full utilities (Meralco, municipal water, PLDT)</p>

    <table>
        <tr>
            <th>Valuation Method</th>
            <th>Price/sqm</th>
            <th>Total Value</th>
            <th>vs. Ask Price</th>
        </tr>
        <tr>
            <td>BIR Zonal Value</td>
            <td>₱2,500-3,000</td>
            <td>₱81-97M</td>
            <td>2.7-3.2x</td>
        </tr>
        <tr>
            <td>Market Estimate</td>
            <td>₱3,500-4,500</td>
            <td>₱113-146M</td>
            <td>3.8-4.9x</td>
        </tr>
        <tr>
            <td><strong>Entry Price</strong></td>
            <td><strong>₱900-925</strong></td>
            <td><strong>₱30M</strong></td>
            <td><strong>Baseline</strong></td>
        </tr>
    </table>

    <div class="alert-yellow">
        <strong>Downside protection:</strong> Land value alone covers purchase price by 2.7-4.9x. Even if business is worthless, this is a winning trade.<br><br>
        <strong>Critical question:</strong> Why is seller accepting 20-33% of land value? Possible distress + urgency OR title defects, zoning restrictions, environmental liens.
    </div>

    <h3>Purchase Price Justification</h3>

    <table>
        <tr>
            <th>Component</th>
            <th>Conservative Value</th>
            <th>Optimistic Value</th>
        </tr>
        <tr>
            <td>Land (zonal value)</td>
            <td>₱81,000,000</td>
            <td>₱97,000,000</td>
        </tr>
        <tr>
            <td>Land (market value)</td>
            <td>₱113,000,000</td>
            <td>₱146,000,000</td>
        </tr>
        <tr>
            <td>Structures & improvements</td>
            <td>₱3,000,000</td>
            <td>₱5,000,000</td>
        </tr>
        <tr>
            <td>Operating business (5x EBITDA)</td>
            <td>₱15,000,000</td>
            <td>₱20,000,000</td>
        </tr>
        <tr>
            <td><strong>Total Enterprise Value</strong></td>
            <td><strong>₱99-116M</strong></td>
            <td><strong>₱148-168M</strong></td>
        </tr>
        <tr>
            <td><strong>Asking Price</strong></td>
            <td><strong>₱30,000,000</strong></td>
            <td><strong>₱30,000,000</strong></td>
        </tr>
        <tr>
            <td><strong>Discount to value</strong></td>
            <td><strong>74-85%</strong></td>
            <td><strong>82-88%</strong></td>
        </tr>
    </table>

    <p><strong>Conclusion:</strong> At ₱30M, you're paying for 37% of land's zonal value and getting the other 63% (₱51M+), operating business (₱15-20M), and structures (₱3-5M) for free. <span class="highlight">This is why the deal looks too good to be true.</span> Verify the "catch."</p>

    <div class="page-break"></div>

    <h2>Operating Business Assessment</h2>

    <h3>Revenue Sources (Seller-Provided, Normalized)</h3>

    <table>
        <tr>
            <th>Revenue Stream</th>
            <th>Annual Estimate</th>
            <th>% of Total</th>
            <th>Dependency Risk</th>
        </tr>
        <tr>
            <td>TESDA vouchers</td>
            <td>₱2.0M</td>
            <td>15%</td>
            <td>Medium (institutional)</td>
        </tr>
        <tr style="background: #fff9e6;">
            <td><strong>Senatorial vouchers (Marcos)</strong></td>
            <td><strong>₱2.8M</strong></td>
            <td><strong>22%</strong></td>
            <td><strong>HIGH - political</strong></td>
        </tr>
        <tr>
            <td>Livestock (pigs, goats, piglets)</td>
            <td>₱7.7M</td>
            <td>59%</td>
            <td>Low (market-based)</td>
        </tr>
        <tr>
            <td>Crops (fruits, vegetables)</td>
            <td>₱0.45M</td>
            <td>4%</td>
            <td>Low</td>
        </tr>
        <tr>
            <td><strong>Total Reported</strong></td>
            <td><strong>₱12.97M</strong></td>
            <td><strong>100%</strong></td>
            <td></td>
        </tr>
    </table>

    <div class="alert-red">
        <strong>Critical issue:</strong> Seller stated revenue is "cumulative over multiple cycles" then "normalized annually." This is financial double-speak.
    </div>

    <h4>Red Flags:</h4>
    <ol>
        <li><strong>Senatorial vouchers (₱2.8M / 22% of revenue)</strong> - tied to Sen. Aimee Marcos. Is this personal relationship-dependent? Is accreditation transferable?</li>
        <li><strong>Livestock revenue (₱7.7M)</strong> - "mixed cycles" suggests this isn't annual revenue but multi-year batches. How many cycles per year?</li>
        <li><strong>No audited financials</strong> - seller clarified expenses cover "~3-year period." If expenses are 3-year cumulative (₱3.58M), then annualized opex is ₱1.2M, making the ₱12.97M revenue figure suspect.</li>
    </ol>

    <div class="section-summary">
        <strong>Buyer's normalized view: ₱3-4M EBITDA</strong><br>
        This suggests actual annual revenue of ₱4-5M (not ₱12.97M) with ₱1-2M expenses.<br><br>
        <strong>Verdict:</strong> Seller's financials are unreliable for valuation. Do not underwrite based on these numbers.
    </div>

    <h2>Risk Assessment</h2>

    <h3>HIGH RISKS (Deal Killers if Not Mitigated)</h3>

    <h4>1. Financial Opacity - HIGH</h4>
    <p><strong>Issue:</strong> Revenue stated as "cumulative over multiple cycles" then "normalized annually." Expenses covering "~3-year period." No audited statements, no bank records, no tax returns provided.</p>
    
    <p><strong>Why this matters:</strong> You're buying ₱30M of land, not a business. But if you're paying ₱30M expecting ₱3-4M EBITDA to cover holding costs, and actual EBITDA is ₱0-1M (or negative), your IRR drops materially.</p>

    <p><strong>Mitigation:</strong></p>
    <ul>
        <li><strong>Demand:</strong> 3 years of bank statements (all accounts), BIR ITRs, audited financials (if any)</li>
        <li><strong>Verify:</strong> TESDA voucher receipts (easy to confirm with TESDA directly)</li>
        <li><strong>Interrogate:</strong> Sen. Marcos vouchers - get copies of contracts, confirm transferability</li>
        <li><strong>Walk the site:</strong> Count livestock, inspect facilities, interview staff off-site</li>
        <li><strong>Financial forensics:</strong> If seller refuses bank statements, walk away or discount price by ₱5-10M</li>
    </ul>

    <p><strong>Contingency:</strong> Structure deal with ₱5M holdback tied to achieving ₱3M EBITDA within first 12 months post-acquisition (earn-out).</p>

    <h4>2. Political Revenue Dependency - HIGH</h4>
    <p><strong>Issue:</strong> ₱2.8M (22% of reported revenue) comes from senatorial vouchers tied to Sen. Aimee Marcos.</p>

    <p><strong>Questions:</strong></p>
    <ul>
        <li>Is this a personal relationship between seller and senator?</li>
        <li>Is the accreditation institutional (tied to the facility) or personal (tied to the owner)?</li>
        <li>Will vouchers continue under new ownership?</li>
        <li>What's the political risk (senator loses next election, program gets defunded)?</li>
    </ul>

    <p><strong>Mitigation:</strong></p>
    <ul>
        <li><strong>Confirm in writing</strong> from TESDA and senator's office that accreditation is transferable</li>
        <li><strong>Discount base case</strong> - assume zero senatorial voucher revenue (₱2.8M haircut)</li>
        <li><strong>Adjusted EBITDA assuming no political revenue:</strong> ₱0.2-1.2M (still covers holding costs)</li>
    </ul>

    <p><strong>Deal impact:</strong> Even if you lose all political revenue, land value still justifies acquisition. But this kills the "cash-flow carry" narrative.</p>

    <h4>3. Permit Transferability - MEDIUM-HIGH</h4>
    <p><strong>Issue:</strong> Seller states permits "can be transferred or re-applied under new ownership; verification required." This is lawyer-speak for "I don't actually know."</p>

    <p><strong>Critical permits:</strong> TESDA accreditation (revenue-dependent), Dept. of Agriculture / ATI approval, Mayor's Permit, Building permits, Environmental permits for piggery</p>

    <p><strong>Mitigation:</strong></p>
    <ul>
        <li><strong>Legal audit:</strong> Request certified copies of ALL permits, verify status, confirm transferability (budget ₱100-150K)</li>
        <li><strong>TESDA direct contact:</strong> Verify accreditation is facility-based, not owner-based</li>
        <li><strong>Contingency:</strong> Include in SPA that seller is responsible for all permit transfer costs + penalties</li>
    </ul>

    <p><strong>Timeline risk:</strong> Permit re-application in Philippines can take 6-18 months. Budget for zero revenue during this window.</p>

    <h4>4. Environmental Compliance (Piggery) - MEDIUM-HIGH</h4>
    <p><strong>Issue:</strong> Property operates a piggery. Piggeries in Philippines require Environmental Compliance Certificate (ECC) from DENR, wastewater discharge permits, compliance with Clean Water Act.</p>

    <p><strong>Likelihood seller has these:</strong> Low (most small piggeries operate informally).</p>

    <p><strong>Risk:</strong></p>
    <ul>
        <li>DENR shuts down piggery post-acquisition</li>
        <li>Neighboring properties file complaints (smell, water contamination)</li>
        <li>Fines + remediation costs (₱500K-2M)</li>
        <li>Reputational damage if positioning as eco-resort</li>
    </ul>

    <p><strong>Mitigation:</strong></p>
    <ul>
        <li><strong>Phase 1 DD:</strong> Request all environmental permits, inspect wastewater systems</li>
        <li><strong>If permits don't exist:</strong> Discount price by ₱2-3M OR require seller to obtain ECC before closing</li>
        <li><strong>Exit plan:</strong> Budget ₱1-2M for piggery decommissioning if environmental risk is unmanageable</li>
    </ul>

    <p><strong>Upside:</strong> If you shut down piggery and pivot to agri-tourism, you eliminate this risk entirely + improve land use.</p>

    <div class="page-break"></div>

    <h2>Exit Strategy Matrix</h2>

    <table>
        <tr>
            <th>Exit Strategy</th>
            <th>Timeline</th>
            <th>Target Price</th>
            <th>Gross Return</th>
            <th>IRR</th>
            <th>Risk</th>
        </tr>
        <tr>
            <td><strong>Land Flip</strong></td>
            <td>12-24 months</td>
            <td>₱100-130M</td>
            <td>3.3-4.3x</td>
            <td>80-120%</td>
            <td>Low</td>
        </tr>
        <tr>
            <td><strong>Business Sale</strong></td>
            <td>24-36 months</td>
            <td>₱50-70M</td>
            <td>1.7-2.3x</td>
            <td>25-35%</td>
            <td>Medium</td>
        </tr>
        <tr>
            <td><strong>Agri-Tourism Development</strong></td>
            <td>36-60 months</td>
            <td>₱150-200M</td>
            <td>5.0-6.7x</td>
            <td>35-50%</td>
            <td>High</td>
        </tr>
        <tr>
            <td><strong>Partial Selldown</strong></td>
            <td>Ongoing</td>
            <td>₱40-60M (50% land)</td>
            <td>Own 1.5ha free</td>
            <td>Variable</td>
            <td>Medium</td>
        </tr>
    </table>

    <h3>Recommended Exit: Land Flip (12-24 months)</h3>
    <p><strong>Target buyer:</strong> Real estate developer, agri-tourism investor<br>
    <strong>Target price:</strong> ₱100-130M (zonal to market value)<br>
    <strong>Execution risk:</strong> Low (land value is established)<br>
    <strong>Catalyst:</strong> Market property, target institutional buyers, offer seller financing</p>

    <h2>Financial Projections (Conservative Case)</h2>

    <h3>Year 1 (Stabilization)</h3>
    <table>
        <tr>
            <th>Line Item</th>
            <th>Amount</th>
            <th>Notes</th>
        </tr>
        <tr>
            <td colspan="3" style="background: #d5f4e6; font-weight: bold;">Revenue</td>
        </tr>
        <tr>
            <td>TESDA vouchers</td>
            <td>₱1,500,000</td>
            <td>Assume 50% (transition risk)</td>
        </tr>
        <tr>
            <td>Senatorial vouchers</td>
            <td>₱0</td>
            <td>Assume zero (political risk)</td>
        </tr>
        <tr>
            <td>Livestock</td>
            <td>₱2,500,000</td>
            <td>Reduce to 1-2 cycles</td>
        </tr>
        <tr>
            <td>Crops</td>
            <td>₱300,000</td>
            <td>Minimal focus</td>
        </tr>
        <tr style="font-weight: bold;">
            <td>Total Revenue</td>
            <td>₱4,300,000</td>
            <td></td>
        </tr>
        <tr>
            <td colspan="3" style="background: #fff9e6; font-weight: bold;">Operating Expenses</td>
        </tr>
        <tr>
            <td>Salaries, training, feedstock, utilities, etc.</td>
            <td>₱2,250,000</td>
            <td>Normalized</td>
        </tr>
        <tr style="font-weight: bold;">
            <td>EBITDA</td>
            <td>₱2,050,000</td>
            <td>48% margin</td>
        </tr>
        <tr>
            <td colspan="3" style="background: #fee; font-weight: bold;">One-time Costs</td>
        </tr>
        <tr>
            <td>100-day plan + professional fees</td>
            <td>₱2,400,000</td>
            <td>Stabilization</td>
        </tr>
        <tr style="font-weight: bold;">
            <td>Year 1 Net Cash Flow</td>
            <td>-₱350,000</td>
            <td>Slight negative</td>
        </tr>
    </table>

    <h3>Year 2-3 (Normalized & Growth)</h3>
    <ul>
        <li><strong>Year 2 EBITDA:</strong> ₱4,500,000 (56% margin) - recover TESDA programs, partial senatorial vouchers, full livestock cycles</li>
        <li><strong>Year 3 EBITDA:</strong> ₱5,500,000 (55% margin) - agri-tourism scaled, training expanded</li>
    </ul>

    <p><strong>Exit valuation (Year 3):</strong></p>
    <ul>
        <li>Land value: ₱130M (market appreciation + improvements)</li>
        <li>Business value: ₱27.5M (5x ₱5.5M EBITDA)</li>
        <li><strong>Total EV:</strong> ₱157.5M</li>
        <li><strong>Gross return:</strong> 5.25x on ₱30M</li>
        <li><strong>3-year IRR:</strong> 73%</li>
    </ul>

    <div class="page-break"></div>

    <h2>Recommendation</h2>

    <div class="alert-green">
        <strong>Investment Decision: PROCEED - TIER 2 PRIORITY</strong>
    </div>

    <h3>Rationale</h3>

    <p><strong>Pros (Deal-Making):</strong></p>
    <ol>
        <li><strong>Exceptional land value arbitrage</strong> - 2.7-4.9x implied return on land alone</li>
        <li><strong>Downside protection</strong> - Even worst case (liquidation at zonal value) returns 2.7x</li>
        <li><strong>Multiple exit paths</strong> - Land flip, business sale, agri-tourism, partial selldown</li>
        <li><strong>Seller distress</strong> - "Fire sale for debt" suggests negotiating leverage</li>
        <li><strong>Cash-flow optionality</strong> - If business works, covers holding costs + generates returns</li>
    </ol>

    <p><strong>Cons (Risk Factors):</strong></p>
    <ol>
        <li><strong>Financial opacity</strong> - Seller's numbers are unreliable, high normalization risk</li>
        <li><strong>Political revenue dependency</strong> - 22% of revenue tied to senator's vouchers</li>
        <li><strong>Permit transferability</strong> - Uncertainty on TESDA accreditation + environmental compliance</li>
        <li><strong>Environmental liability</strong> - Piggery may have violations, ₱1-2M remediation cost</li>
        <li><strong>Operational complexity</strong> - Inheriting business without team, 6-12 month stabilization</li>
    </ol>

    <div class="section-summary">
        <strong>Net Assessment:</strong><br><br>
        This is a <strong>land play with a business hedge</strong>, not a business acquisition. You're paying ₱30M for ₱81-146M of land. The operating business is free optionality - if it works, great (₱3-5M EBITDA). If it doesn't, you still have a 2.7x+ return on land.
    </div>

    <h3>Recommended Deal Terms</h3>

    <p><strong>Offer:</strong> ₱28,000,000</p>
    <ul>
        <li>₱15M on signing (post-DD approval)</li>
        <li>₱8M on clean title transfer + TESDA accreditation confirmation</li>
        <li>₱5M holdback (18-month escrow) for warranty claims</li>
    </ul>

    <p><strong>Conditions precedent:</strong></p>
    <ol>
        <li>Clean title + zoning confirmation</li>
        <li>TESDA accreditation verified as transferable</li>
        <li>Environmental audit passes OR seller remediates at cost</li>
        <li>Seller provides 3 years bank statements + ITRs</li>
        <li>Easement rights legally confirmed</li>
    </ol>

    <p><strong>Walk-away triggers:</strong></p>
    <ul>
        <li>Title defects >₱2M to cure</li>
        <li>Independent appraisal <₱60M</li>
        <li>TESDA non-transferable + zero senatorial vouchers (loses 37% of revenue)</li>
    </ul>

    <p><strong>Negotiating leverage:</strong></p>
    <ul>
        <li>Seller is distressed ("fire sale for debt")</li>
        <li>Seller has financial opacity (can't prove claimed EBITDA)</li>
        <li>Buyer has other deals in pipeline (opportunity cost)</li>
    </ul>

    <div class="alert-green">
        <strong>Expected return (conservative):</strong><br>
        Exit Year 3 at ₱130M (land-led sale)<br>
        <strong>Gross return:</strong> 3.9-4.3x on ₱30-33M all-in<br>
        <strong>3-year IRR:</strong> 60-75%
    </div>

    <h2>Next Steps (Immediate Actions)</h2>

    <h3>Week 1: Pre-DD Setup</h3>
    <ol>
        <li><strong>Engage counsel</strong> - Retain real estate lawyer for title search + SPA drafting (₱150K retainer)</li>
        <li><strong>Appoint lead DD</strong> - Assign internal team member to coordinate workstreams</li>
        <li><strong>Draft LOI</strong> - Submit non-binding offer at ₱28M with DD conditions (72-hour response deadline)</li>
    </ol>

    <h3>Week 2-6: Phase 1-3 DD</h3>
    <ul>
        <li><strong>Legal & Title:</strong> Title verification, zoning cert, easement review, site visit</li>
        <li><strong>Financial & Operational:</strong> Bank statements, ITRs, TESDA verification, livestock inventory</li>
        <li><strong>Environmental & Permits:</strong> Environmental audit, permit inventory, flood assessment</li>
        <li><strong>Market Validation:</strong> Independent appraisal, comps research, TESDA market check, agri-tourism feasibility</li>
    </ul>

    <h3>Week 7: Go/No-Go Decision</h3>
    <ul>
        <li>DD synthesis, red flag review, adjust valuation</li>
        <li>Submit binding offer with adjusted terms</li>
        <li>If accepted: earnest money deposit (₱2-3M)</li>
    </ul>

    <h3>Week 8-10: Closing</h3>
    <ul>
        <li>SPA drafting, escrow setup, title transfer</li>
        <li>Closing meeting, release ₱15M down payment</li>
        <li>Initiate 100-day plan</li>
    </ul>

    <div class="footer">
        <strong>Report prepared by:</strong> Verch (PE Fund Due Diligence)<br>
        <strong>Date:</strong> February 9, 2026<br>
        <strong>Confidential:</strong> Internal use only, not for seller distribution<br><br>
        <strong style="color: #27ae60;">FINAL VERDICT: PROCEED TO DD WITH ₱28M OFFER</strong><br>
        This deal has exceptional risk-adjusted returns driven by land value arbitrage. The operating business is a bonus, not the thesis. Biggest risks are financial opacity and permit transferability, both mitigable through structured DD and deal terms. Recommend moving to LOI submission within 72 hours to test seller's distress level and negotiating posture.
    </div>
</body>
</html>
`;

fs.writeFileSync('arrandia_farm_dd_report.html', html);
console.log('HTML report generated: arrandia_farm_dd_report.html');
