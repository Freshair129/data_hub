"""
marketing_sync.py
─────────────────
Bulk fetcher for Facebook Marketing API data.
Handles Campaigns, AdSets, Ads, and Daily Insights.
Updates PostgreSQL via db_adapter.py.
"""

import os
import json
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.adsinsights import AdsInsights

from db_adapter import upsert_marketing_data, upsert_ad_daily_metrics

load_dotenv()

def call_with_retry(func, *args, **kwargs):
    max_retries = 5
    base_delay = 30 # Start with 30 seconds
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if "User request limit reached" in str(e) or "too many calls" in str(e) or "80004" in str(e):
                delay = base_delay * (2 ** attempt)
                print(f"⚠️ Rate limit hit. Waiting {delay} seconds before retry (Attempt {attempt+1}/{max_retries})...")
                time.sleep(delay)
            else:
                raise e
    return func(*args, **kwargs) # Last attempt without catching

def sync_marketing_data():
    # 1. Config
    access_token = os.getenv('FB_ACCESS_TOKEN')
    ad_account_id = os.getenv('FB_AD_ACCOUNT_ID')
    
    if not access_token or not ad_account_id:
        print("[MarketingSync] ❌ Missing credentials in .env")
        return

    # 2. Init API
    FacebookAdsApi.init(access_token=access_token)
    account_id = f"act_{ad_account_id}" if not ad_account_id.startswith("act_") else ad_account_id
    account = AdAccount(account_id)
    
    data = {
        "campaigns": [],
        "adsets": [],
        "ads": [],
        "creatives": []
    }

    try:
        print(f"[MarketingSync] 🔄 Fetching bulk data for {account_id}...")

        # -- Fetch Campaigns (ACTIVE only) --
        fields = [Campaign.Field.id, Campaign.Field.name, Campaign.Field.status, Campaign.Field.objective, Campaign.Field.start_time]
        campaigns = call_with_retry(account.get_campaigns, fields=fields, params={'effective_status': ['ACTIVE']})
        data["campaigns"] = [c.export_all_data() for c in campaigns]
        print(f"✅ Found {len(data['campaigns'])} Active Campaigns")
        time.sleep(2)

        # -- Fetch AdSets (ACTIVE only) --
        fields = [AdSet.Field.id, AdSet.Field.name, AdSet.Field.status, AdSet.Field.daily_budget, AdSet.Field.campaign_id, AdSet.Field.targeting]
        adsets = call_with_retry(account.get_ad_sets, fields=fields, params={'effective_status': ['ACTIVE']})
        data["adsets"] = [a.export_all_data() for a in adsets]
        print(f"✅ Found {len(data['adsets'])} Active AdSets")
        time.sleep(2)

        # -- Fetch Ads (ACTIVE only) --
        fields = [Ad.Field.id, Ad.Field.name, Ad.Field.status, Ad.Field.adset_id, Ad.Field.creative]
        ads = call_with_retry(account.get_ads, fields=fields, params={'effective_status': ['ACTIVE']})
        data["ads"] = [a.export_all_data() for a in ads]
        print(f"✅ Found {len(data['ads'])} Active Ads")
        time.sleep(2)

        # -- Skip bulk creatives fetching to avoid rate limits --
        # data["creatives"] = [] # Placeholder

        # 3. Save Bulk Data to DB
        success = upsert_marketing_data(data)
        if not success:
            print("[MarketingSync] ❌ Failed to save bulk data to DB")
            return

        # 4. Fetch Daily Insights (Year 2026 Only)
        print("[MarketingSync] 🔄 Fetching Daily Insights (Year 2026 window)...")
        since = '2026-01-01'
        until = datetime.now().strftime('%Y-%m-%d')
        
        insight_fields = [
            AdsInsights.Field.ad_id,
            AdsInsights.Field.spend,
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.actions,
            AdsInsights.Field.action_values,
            AdsInsights.Field.purchase_roas,
        ]
        
        insights = call_with_retry(account.get_insights, fields=insight_fields, params={
            'time_range': {'since': since, 'until': until},
            'level': 'ad',
            'time_increment': 1 # Daily
        })
        
        metrics_list = []
        for ins in insights:
            actions = ins.get('actions', [])
            leads = sum([int(a['value']) for a in actions if a['action_type'] == 'lead'])
            purchases = sum([int(a['value']) for a in actions if a['action_type'] == 'purchase'])
            
            # Extract Revenue (purchase_value)
            action_values = ins.get('action_values', [])
            revenue = sum([float(av['value']) for av in action_values if av['action_type'] == 'purchase'])
            
            # Extract ROAS
            roas_data = ins.get('purchase_roas', [])
            roas = float(roas_data[0]['value']) if roas_data else (revenue / float(ins.get('spend', 1)) if float(ins.get('spend', 0)) > 0 else 0)

            metrics_list.append({
                'ad_id': ins.get('ad_id'),
                'date': ins.get('date_start'),
                'spend': float(ins.get('spend', 0)),
                'impressions': int(ins.get('impressions', 0)),
                'clicks': int(ins.get('clicks', 0)),
                'leads': leads,
                'purchases': purchases,
                'revenue': revenue,
                'roas': roas
            })
            
        if metrics_list:
            upsert_ad_daily_metrics(metrics_list)
            print(f"✅ Processed {len(metrics_list)} daily metric entries")

        print("[MarketingSync] 🏁 Sync Complete!")
        print(json.dumps({"success": True, "details": "Marketing sync completed successfully"}))

    except Exception as e:
        print(f"[MarketingSync] ❌ Error during sync: {e}")
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    sync_marketing_data()

if __name__ == "__main__":
    sync_marketing_data()
