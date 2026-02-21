# Incident Report: Shabu Campaign Attribution Logic Error (Deep Dive)

**Incident ID**: `INC-20260218-ATTR-REPORT`
**Date**: 2026-02-18
**Severity**: `MEDIUM` (Logic/Reporting Error)

## 📝 Background
The "Dinner" (Shabu) campaign was initially reported as a high-revenue success. Subsequent analysis revealed that the revenue was actually attributed to a high-value cross-sell (Ramen Course) rather than the advertised product.

## 🔍 Investigation Details (from ERR-20260218-001)

### The Case of Customer "Chakkrit"
1. **Entry Point**: Clicked "Dinner" ad (Shabu New).
2. **First Contact**: Received automated "Private Dinner" message.
3. **Conversion Path**:
   - Customer expressed interest in "Academic/Professional" details rather than dinner.
   - Sales team redirected customer to **Professional Ramen Course** + **Intensive Sushi**.
   - Total Transaction: **34,000 THB**.
4. **Attribution Error**: The reporting engine credited the "Dinner Ad" for a 34k "Shabu sale" because it was the source of the Lead.

## 🚩 Analysis Results
- **Direct Ad Sales**: 0 THB (No Shabu products sold).
- **Influenced/Cross-Sell Sales**: 34,000 THB.
- **Key Insight**: High CTR/CPM on the Dinner ad did not mean the *Shabu* product was selling. It meant the ad was a great "Lead Magnet" for high-intent students who then bought core courses.

## 🚀 Corrective Actions (ADR-011)
- Implement **Product-Matched Attribution**: Revenue is only "Direct" if the `sku` matches the `ad_target`.
- Label all other revenue from ad-leads as **"Halo Revenue"** or **"Cross-Sell"** to provide an accurate ROAS for scaling decisions.
