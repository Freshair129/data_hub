"""
Import existing marketing log JSON files into the database.
Reads from marketing/logs/daily/ and marketing/logs/hourly/
"""
import os
import json
import glob
import secrets
from datetime import datetime, timezone
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values

load_dotenv()

AD_ACCOUNT_ID = "act_231498665634943"
AD_ACCOUNT_NAME = "The V School"

def cuid():
    return "c" + secrets.token_hex(12)

def get_action(actions, action_type):
    for a in actions:
        if a.get("action_type") == action_type:
            return int(float(a.get("value", 0)))
    return 0

def run():
    db_url = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Ensure AdAccount exists
    cur.execute("""
        INSERT INTO ad_accounts (id, "accountId", name, created_at, updated_at)
        VALUES (%s, %s, %s, NOW(), NOW())
        ON CONFLICT ("accountId") DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
    """, (cuid(), AD_ACCOUNT_ID, AD_ACCOUNT_NAME))

    # Get ad_account internal id
    cur.execute('SELECT id FROM ad_accounts WHERE "accountId" = %s', (AD_ACCOUNT_ID,))
    ad_account_db_id = cur.fetchone()[0]

    # Find all json log files (daily + hourly)
    log_files = sorted(
        glob.glob("marketing/logs/daily/**/*.json", recursive=True) +
        glob.glob("marketing/logs/hourly/**/*.json", recursive=True)
    )
    print(f"📂 Found {len(log_files)} log files to import.")

    campaigns_upserted = 0
    adsets_upserted = set()
    ads_upserted = set()
    daily_metrics = 0

    for log_file in log_files:
        with open(log_file, "r") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                print(f"  ⚠️ Skipping invalid JSON: {log_file}")
                continue

        log_date = data.get("date")
        campaigns = data.get("campaigns", [])

        for campaign in campaigns:
            campaign_id = campaign.get("id")
            campaign_name = campaign.get("name", "")
            c_spend = campaign.get("spend", 0)
            c_impressions = campaign.get("impressions", 0)
            c_clicks = campaign.get("clicks", 0)
            c_leads = get_action(campaign.get("actions", []), "lead")
            c_purchases = get_action(campaign.get("actions", []), "purchase")

            # Upsert Campaign
            cur.execute("""
                INSERT INTO campaigns (id, campaign_id, name, status, spend, impressions, clicks, leads, purchases, ad_account_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (campaign_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    spend = EXCLUDED.spend,
                    impressions = EXCLUDED.impressions,
                    clicks = EXCLUDED.clicks,
                    leads = EXCLUDED.leads,
                    purchases = EXCLUDED.purchases,
                    updated_at = NOW()
            """, (cuid(), campaign_id, campaign_name, "ACTIVE", c_spend, c_impressions, c_clicks, c_leads, c_purchases, ad_account_db_id))
            campaigns_upserted += 1

            # Get campaign internal id
            cur.execute("SELECT id FROM campaigns WHERE campaign_id = %s", (campaign_id,))
            campaign_db_id = cur.fetchone()[0]

            for ad in campaign.get("ads", []):
                ad_id = ad.get("id")
                ad_name = ad.get("name", "")
                adset_id = ad.get("adset_id")
                adset_name = ad.get("adset_name", "")
                a_spend = ad.get("spend", 0)
                a_impressions = ad.get("impressions", 0)
                a_clicks = ad.get("clicks", 0)

                # Upsert AdSet
                if adset_id and adset_id not in adsets_upserted:
                    cur.execute("""
                        INSERT INTO ad_sets (id, ad_set_id, name, status, campaign_id, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (ad_set_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            updated_at = NOW()
                    """, (cuid(), adset_id, adset_name, "ACTIVE", campaign_db_id))
                    adsets_upserted.add(adset_id)

                # Get adset internal id
                cur.execute("SELECT id FROM ad_sets WHERE ad_set_id = %s", (adset_id,))
                adset_row = cur.fetchone()
                if not adset_row:
                    continue
                adset_db_id = adset_row[0]

                # Upsert Ad
                if ad_id and ad_id not in ads_upserted:
                    cur.execute("""
                        INSERT INTO ads (id, ad_id, name, status, ad_set_id, spend, impressions, clicks, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (ad_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            spend = EXCLUDED.spend,
                            impressions = EXCLUDED.impressions,
                            clicks = EXCLUDED.clicks,
                            updated_at = NOW()
                    """, (cuid(), ad_id, ad_name, "ACTIVE", adset_db_id, a_spend, a_impressions, a_clicks))
                    ads_upserted.add(ad_id)

                # Insert daily metric
                if log_date:
                    try:
                        a_leads = get_action(ad.get("actions", []), "lead")
                        a_purchases = get_action(ad.get("actions", []), "purchase")
                        cur.execute("""
                            INSERT INTO ad_daily_metrics (id, ad_id, date, spend, impressions, clicks, leads, purchases, created_at)
                            VALUES (%s, %s, %s::date, %s, %s, %s, %s, %s, NOW())
                            ON CONFLICT (ad_id, date) DO UPDATE SET
                                spend = EXCLUDED.spend,
                                impressions = EXCLUDED.impressions,
                                clicks = EXCLUDED.clicks,
                                leads = EXCLUDED.leads,
                                purchases = EXCLUDED.purchases
                        """, (cuid(), ad_id, log_date, a_spend, a_impressions, a_clicks, a_leads, a_purchases))
                        daily_metrics += 1
                    except Exception as e:
                        print(f"  ⚠️ Daily metric error for {ad_id} on {log_date}: {e}")
                        conn.rollback()

        conn.commit()
        print(f"  ✅ {log_file}")

    print(f"\n✨ Import complete!")
    print(f"   📊 Campaigns: {campaigns_upserted}")
    print(f"   📊 Ad Sets: {len(adsets_upserted)}")
    print(f"   📊 Ads: {len(ads_upserted)}")
    print(f"   📊 Daily Metrics: {daily_metrics}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    run()
