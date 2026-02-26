"""
Incremental Facebook Ads API Sync Worker.
Fetches Campaigns, Ad Sets, Ads, and Daily Metrics that were updated
after the last successful sync from the database.
"""
import os
import json
import secrets
from datetime import datetime, timezone, timedelta
import requests
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

ACCESS_TOKEN = os.getenv('FB_ACCESS_TOKEN')
AD_ACCOUNT_ID = os.getenv('FB_AD_ACCOUNT_ID')
DB_URL = os.getenv("DATABASE_URL")
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
LINE_GROUP_ID = os.getenv("LINE_GROUP_ID")
CRM_BASE_URL = os.getenv("CRM_BASE_URL", "http://localhost:3000")

API_VERSION = "v19.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

if not ACCESS_TOKEN or not AD_ACCOUNT_ID or not DB_URL:
    print("❌ Error: Missing essential environment variables (FB_ACCESS_TOKEN, FB_AD_ACCOUNT_ID, DATABASE_URL).")
    exit(1)

def send_line_alert(message, flex_contents=None):
    if not LINE_CHANNEL_ACCESS_TOKEN or not LINE_GROUP_ID:
        print("⚠️ LINE credentials or Group ID not set, skipping alert.")
        return
    try:
        url = "https://api.line.me/v2/bot/message/push"
        headers = {
            "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }
        
        msg_obj = {
            "type": "text",
            "text": message
        }
        
        if flex_contents:
            msg_obj = {
                "type": "flex",
                "altText": message[:400], # Alt text for notifications
                "contents": flex_contents
            }

        payload = {
            "to": LINE_GROUP_ID,
            "messages": [msg_obj]
        }
        res = requests.post(url, headers=headers, json=payload)
        if res.status_code != 200:
             print(f"❌ LINE Messaging API Error: {res.text}")
    except Exception as e:
        print(f"❌ Failed to send LINE message: {e}")

def cuid():
    return "c" + secrets.token_hex(12)

def get_action(actions, action_type):
    for a in actions:
        if a.get("action_type") == action_type:
            return int(float(a.get("value", 0)))
    return 0

def get_leads(actions):
    """
    For Messaging campaigns (V School's primary type), Facebook counts 'results'
    as messaging_conversation_started_7d, NOT as 'lead'.
    We use a priority-based fallback to match what Facebook Ads Manager shows.
    """
    # Priority 1: Messaging conversations (what FB Ads Manager shows as "Results" for MSG campaigns)
    msg_convos = get_action(actions, "onsite_conversion.messaging_conversation_started_7d")
    if msg_convos > 0:
        return msg_convos
    
    # Priority 2: Total messaging connections
    msg_connections = get_action(actions, "onsite_conversion.total_messaging_connection")
    if msg_connections > 0:
        return msg_connections
    
    # Priority 3: Traditional lead (for Lead Gen or Conversion campaigns)
    traditional_lead = get_action(actions, "lead")
    if traditional_lead > 0:
        return traditional_lead
    
    return 0

def fetch_facebook_data(url):
    print(f"👉 Fetching: {url}")
    res = requests.get(url)
    if res.status_code != 200:
        print(f"❌ Facebook API Error: {res.text}")
        return None
    return res.json()

def get_last_sync_time(cur, table_name, fallback_days_ago=30, min_drift_lookback=3):
    cur.execute(f"SELECT MAX(updated_at) FROM {table_name}")
    last_sync = cur.fetchone()[0]
    
    # Calculate what 3 days ago from RIGHT NOW is
    three_days_ago = datetime.now() - timedelta(days=min_drift_lookback)
    
    if last_sync:
        # If last_sync is very recent (e.g. 1 hour ago), we still want to look back 3 days
        # to catch any delayed Facebook attribution changes.
        effective_sync = min(last_sync, three_days_ago)
        return int(effective_sync.timestamp())
    
    # If table is empty, fall back to a default lookback period
    fallback = datetime.now() - timedelta(days=fallback_days_ago)
    return int(fallback.timestamp())

def sync_campaigns(conn, cur):
    print("🔄 Syncing Campaigns...")
    last_sync = get_last_sync_time(cur, "campaigns")
    print(f"   Last sync was: {datetime.fromtimestamp(last_sync)}")

    # Add 1 second to avoid fetching the exact same record again if it didn't change
    last_sync += 1 

    # We use updated_time for incremental
    filtering = f'[{{field: "updated_time", operator: "GREATER_THAN", value: {last_sync}}}]'
    
    url = f"{BASE_URL}/{AD_ACCOUNT_ID}/campaigns?fields=id,name,status,objective,start_time,stop_time,daily_budget,lifetime_budget,updated_time,insights.date_preset(maximum){{spend,impressions,clicks,actions}}&limit=50&filtering={filtering}&access_token={ACCESS_TOKEN}"
    
    # Ensure AdAccount exists first
    cur.execute("""
        INSERT INTO ad_accounts (id, "accountId", name, created_at, updated_at)
        VALUES (%s, %s, %s, NOW(), NOW())
        ON CONFLICT ("accountId") DO UPDATE SET updated_at = NOW()
    """, (cuid(), AD_ACCOUNT_ID, "V School Ads"))
    
    cur.execute('SELECT id FROM ad_accounts WHERE "accountId" = %s', (AD_ACCOUNT_ID,))
    ad_account_db_id = cur.fetchone()[0]

    upserted = 0
    
    while url:
        data = fetch_facebook_data(url)
        if not data:
            break
            
        campaigns = data.get('data', [])
        for c in campaigns:
            c_id = c.get('id')
            c_name = c.get('name', '')
            c_status = c.get('status', 'PAUSED')
            c_objective = c.get('objective')
            
            c_start = c.get('start_time')
            c_stop = c.get('stop_time')
            
            ins = c.get('insights', {}).get('data', [{}])[0]
            c_spend = float(ins.get('spend', 0))
            c_imp = int(ins.get('impressions', 0))
            c_clicks = int(ins.get('clicks', 0))
            actions = ins.get('actions', [])
            c_leads = get_leads(actions)
            c_purchases = get_action(actions, 'purchase')
            
            # Start/stop time parsing if present
            start_dt = f"'{c_start}'" if c_start else "NULL"
            stop_dt = f"'{c_stop}'" if c_stop else "NULL"

            cur.execute(f"""
                INSERT INTO campaigns (id, campaign_id, name, objective, status, spend, impressions, clicks, leads, purchases, ad_account_id, start_date, end_date, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, {start_dt}, {stop_dt}, NOW(), NOW())
                ON CONFLICT (campaign_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    objective = EXCLUDED.objective,
                    status = EXCLUDED.status,
                    spend = EXCLUDED.spend,
                    impressions = EXCLUDED.impressions,
                    clicks = EXCLUDED.clicks,
                    leads = EXCLUDED.leads,
                    purchases = EXCLUDED.purchases,
                    end_date = EXCLUDED.end_date,
                    updated_at = NOW()
            """, (cuid(), c_id, c_name, c_objective, c_status, c_spend, c_imp, c_clicks, c_leads, c_purchases, ad_account_db_id))
            upserted += 1
            
        conn.commit()
        url = data.get('paging', {}).get('next')
        
    print(f"✅ Upserted {upserted} Campaigns.")

def sync_ads_and_adsets(conn, cur):
    print("🔄 Syncing Ads & Ad Sets...")
    last_sync = get_last_sync_time(cur, "ads")
    print(f"   Last sync was: {datetime.fromtimestamp(last_sync)}")
    last_sync += 1

    filtering = f'[{{field: "updated_time", operator: "GREATER_THAN", value: {last_sync}}}]'
    
    # We fetch Ads directly, which includes Campaign and AdSet details. Note the addition of effective_status.
    url = f"{BASE_URL}/{AD_ACCOUNT_ID}/ads?fields=id,name,status,effective_status,adset{{id,name,status,campaign_id}},campaign{{id,name}},creative{{thumbnail_url,image_url}},updated_time,insights.date_preset(last_30d){{spend,impressions,clicks,actions}}&limit=100&filtering={filtering}&access_token={ACCESS_TOKEN}"
    
    upserted_adsets = set()
    upserted_ads = 0
    live_ads_updated = 0
    
    while url:
        data = fetch_facebook_data(url)
        if not data:
            break
            
        ads = data.get('data', [])
        for ad in ads:
            # 1. Ensure Campaign exists to satisfy FK constraint (if not already upserted)
            camp_info = ad.get('campaign', {})
            camp_id = camp_info.get('id')
            if camp_id:
                cur.execute("""
                    INSERT INTO campaigns (id, campaign_id, name, status, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (campaign_id) DO NOTHING
                """, (cuid(), camp_id, camp_info.get('name', ''), 'ACTIVE'))
                
                # We need the Internal DB ID for the Campaign
                cur.execute("SELECT id FROM campaigns WHERE campaign_id = %s", (camp_id,))
                camp_db_id = cur.fetchone()[0]
                
                # 2. Upsert AdSet
                adset_info = ad.get('adset', {})
                adset_id = adset_info.get('id')
                if adset_id and adset_id not in upserted_adsets:
                    cur.execute("""
                        INSERT INTO ad_sets (id, ad_set_id, name, status, campaign_id, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (ad_set_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            status = EXCLUDED.status,
                            updated_at = NOW()
                    """, (cuid(), adset_id, adset_info.get('name', ''), adset_info.get('status', 'ACTIVE'), camp_db_id))
                    upserted_adsets.add(adset_id)
                
                # Get Internal DB ID for the AdSet
                if adset_id:
                    cur.execute("SELECT id FROM ad_sets WHERE ad_set_id = %s", (adset_id,))
                    adset_row = cur.fetchone()
                    if adset_row:
                        adset_db_id = adset_row[0]
                        
                        # 3. Upsert Ad
                        ad_id = ad.get('id')
                        ad_name = ad.get('name', '')
                        ad_status = ad.get('status', 'PAUSED')
                        ad_delivery_status = ad.get('effective_status', 'UNKNOWN')
                        
                        # Fetch existing ad status to check for newly DISAPPROVED
                        cur.execute("SELECT delivery_status FROM ads WHERE ad_id = %s", (ad_id,))
                        old_ad_row = cur.fetchone()
                        old_delivery_status = old_ad_row[0] if old_ad_row else None
                        
                        if ad_delivery_status == 'DISAPPROVED' and old_delivery_status != 'DISAPPROVED':
                             camp_name = camp_info.get('name', 'Unknown Campaign')
                             send_line_alert(f"\n🚨 [FB Ads Alert: DISAPPROVED]\n\nแคมเปญ: {camp_name}\nแอด: {ad_name}\n\nโฆษณาถูกระงับการนำส่ง กรุณาตรวจสอบใน Ads Manager ด่วน!")

                        ins = ad.get('insights', {}).get('data', [{}])[0]
                        a_spend = float(ins.get('spend', 0))
                        a_imp = int(ins.get('impressions', 0))
                        a_clicks = int(ins.get('clicks', 0))
                        
                        cur.execute("""
                            INSERT INTO ads (id, ad_id, name, status, delivery_status, ad_set_id, spend, impressions, clicks, created_at, updated_at)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                            ON CONFLICT (ad_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                status = EXCLUDED.status,
                                delivery_status = EXCLUDED.delivery_status,
                                spend = EXCLUDED.spend,
                                impressions = EXCLUDED.impressions,
                                clicks = EXCLUDED.clicks,
                                updated_at = NOW()
                            RETURNING id
                        """, (cuid(), ad_id, ad_name, ad_status, ad_delivery_status, adset_db_id, a_spend, a_imp, a_clicks))
                        internal_ad_id = cur.fetchone()[0]
                        upserted_ads += 1

                        # 4. Check Hourly Delta for LiveStatus
                        if ad_status == 'ACTIVE' and ad_delivery_status == 'ACTIVE': 
                            # 'ACTIVE' effective_status implies delivering
                            # Fetch impressions strictly for the last hour to see if it's moving
                            recent_since = (datetime.now() - timedelta(hours=2)).strftime('%Y-%m-%dT%H:00:00')
                            recent_until = datetime.now().strftime('%Y-%m-%dT%H:59:59')
                            hourly_url = f"{BASE_URL}/{ad_id}/insights?time_increment=1&time_range={{\"since\":\"{recent_since}\",\"until\":\"{recent_until}\"}}&fields=impressions&access_token={ACCESS_TOKEN}"
                            
                            is_running = False
                            try:
                                hourly_res = requests.get(hourly_url)
                                if hourly_res.status_code == 200:
                                     h_data = hourly_res.json().get('data', [])
                                     if h_data and int(h_data[0].get('impressions', 0)) > 0:
                                          is_running = True
                            except Exception:
                                 pass # If fails, assume not running this hour

                            cur.execute("""
                                INSERT INTO ad_live_status (id, ad_id, last_impression_time, is_running_now, updated_at)
                                VALUES (%s, %s, NOW(), %s, NOW())
                                ON CONFLICT (ad_id) DO UPDATE SET
                                    is_running_now = EXCLUDED.is_running_now,
                                    last_impression_time = CASE WHEN EXCLUDED.is_running_now THEN NOW() ELSE ad_live_status.last_impression_time END,
                                    updated_at = NOW()
                            """, (cuid(), internal_ad_id, is_running))
                            live_ads_updated += 1
                        else:
                            # Not active, definitely not running
                            cur.execute("""
                                INSERT INTO ad_live_status (id, ad_id, last_impression_time, is_running_now, updated_at)
                                VALUES (%s, %s, NOW(), false, NOW())
                                ON CONFLICT (ad_id) DO UPDATE SET
                                    is_running_now = false,
                                    updated_at = NOW()
                            """, (cuid(), internal_ad_id))
                        
        conn.commit()
        url = data.get('paging', {}).get('next')

    print(f"✅ Upserted {len(upserted_adsets)} Ad Sets, {upserted_ads} Ads, and {live_ads_updated} Live Status checks.")

def sync_daily_metrics(conn, cur):
    print("🔄 Syncing Ad Daily Metrics...")
    # Fetch the last 30 days of performance to match the dashboard's default view.
    # This also catches any delayed Facebook attribution changes.
    
    since = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    until = datetime.now().strftime('%Y-%m-%d')
    
    url = f"{BASE_URL}/{AD_ACCOUNT_ID}/insights?level=ad&time_increment=1&time_range={{\"since\":\"{since}\",\"until\":\"{until}\"}}&fields=ad_id,spend,impressions,clicks,actions&limit=500&access_token={ACCESS_TOKEN}"
    
    upserted_metrics = 0
    
    while url:
        data = fetch_facebook_data(url)
        if not data:
            break
            
        insights = data.get('data', [])
        for row in insights:
            ad_id = row.get('ad_id')
            date_start = row.get('date_start')
            
            if ad_id and date_start:
                # Ensure Ad exists for FK constraint
                cur.execute("SELECT id FROM ads WHERE ad_id = %s", (ad_id,))
                ad_row = cur.fetchone()
                
                if ad_row:
                    a_spend = float(row.get('spend', 0))
                    a_imp = int(row.get('impressions', 0))
                    a_clicks = int(row.get('clicks', 0))
                    actions = row.get('actions', [])
                    a_leads = get_leads(actions)
                    a_purchases = get_action(actions, 'purchase')
                    
                    cur.execute("""
                        INSERT INTO ad_daily_metrics (id, ad_id, date, spend, impressions, clicks, leads, purchases, created_at)
                        VALUES (%s, %s, %s::date, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (ad_id, date) DO UPDATE SET
                            spend = EXCLUDED.spend,
                            impressions = EXCLUDED.impressions,
                            clicks = EXCLUDED.clicks,
                            leads = EXCLUDED.leads,
                            purchases = EXCLUDED.purchases
                    """, (cuid(), ad_id, date_start, a_spend, a_imp, a_clicks, a_leads, a_purchases))
                    upserted_metrics += 1
                    
        conn.commit()
        url = data.get('paging', {}).get('next')
        
    print(f"✅ Upserted {upserted_metrics} Daily Metrics.")

def check_and_send_daily_summary(cur):
    now = datetime.now()
    if now.hour < 9:
        return # Not 9 AM yet
        
    cache_dir = os.path.join(os.path.dirname(__file__), '..', 'cache')
    os.makedirs(cache_dir, exist_ok=True)
    state_file = os.path.join(cache_dir, 'line_notify_state.json')
    
    today_str = now.strftime('%Y-%m-%d')
    
    state = {}
    if os.path.exists(state_file):
        try:
            with open(state_file, 'r', encoding='utf-8') as f:
                state = json.load(f)
        except:
            pass
            
    if state.get('last_daily_summary_date') == today_str:
        return # Already sent today
        
    yesterday = (now - timedelta(days=1)).strftime('%Y-%m-%d')
    first_of_month = now.replace(day=1).strftime('%Y-%m-%d')
    
    print(f"📊 Generating Flex Daily Summary for {yesterday}...")
    
    # Query Yesterday's Detailed Data
    cur.execute("""
        SELECT a.name, c.name, m.spend, m.leads
        FROM ad_daily_metrics m
        JOIN ads a ON m.ad_id = a.ad_id
        JOIN ad_sets s ON a.ad_set_id = s.id
        JOIN campaigns c ON s.campaign_id = c.id
        WHERE m.date = %s AND (m.spend > 0 OR m.leads > 0)
    """, (yesterday,))
    rows = cur.fetchall()
    
    # Query Month-To-Date Aggregates
    cur.execute("""
        SELECT SUM(spend), SUM(leads)
        FROM ad_daily_metrics
        WHERE date >= %s AND date <= %s
    """, (first_of_month, yesterday))
    mtd_row = cur.fetchone()
    mtd_spend = float(mtd_row[0] or 0)
    mtd_leads = int(mtd_row[1] or 0)

    if not rows:
        print("   No spend data found for yesterday.")
        # Mark as sent to prevent retries
        state['last_daily_summary_date'] = today_str
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(state, f)
        return
        
    categories = {
        '🍣 Sushi': {'spend': 0.0, 'leads': 0},
        '🍜 Ramen': {'spend': 0.0, 'leads': 0},
        '🥟 Dimsum': {'spend': 0.0, 'leads': 0},
        '🧒 Kids Camp': {'spend': 0.0, 'leads': 0},
        '🌐 Other': {'spend': 0.0, 'leads': 0}
    }
    
    total_spend = 0.0
    total_leads = 0
    
    for row in rows:
        ad_name, camp_name, spend, leads = row
        spend = float(spend)
        leads = int(leads or 0)
        total_spend += spend
        total_leads += leads
        
        lower_name = f"{ad_name} {camp_name}".lower()
        cat_key = '🌐 Other'
        if 'sushi' in lower_name or 'ซูชิ' in lower_name:
            cat_key = '🍣 Sushi'
        elif 'ramen' in lower_name or 'ราเมน' in lower_name:
            cat_key = '🍜 Ramen'
        elif 'dimsum' in lower_name or 'ติ่มซำ' in lower_name:
            cat_key = '🥟 Dimsum'
        elif 'kids' in lower_name or 'เด็ก' in lower_name or 'camp' in lower_name:
            cat_key = '🧒 Kids Camp'
            
        categories[cat_key]['spend'] += spend
        categories[cat_key]['leads'] += leads

    # Build Flex Message Bubble
    category_boxes = []
    for cat_name, data in categories.items():
        if data['spend'] > 0 or data['leads'] > 0:
            category_boxes.append({
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {"type": "text", "text": cat_name, "size": "sm", "color": "#555555", "flex": 4},
                    {"type": "text", "text": f"฿{data['spend']:,.0f}", "size": "sm", "color": "#111111", "align": "end", "flex": 3},
                    {"type": "text", "text": f"{data['leads']}", "size": "sm", "color": "#E62129", "align": "end", "weight": "bold", "flex": 2}
                ],
                "margin": "sm"
            })

    flex_bubble = {
        "type": "bubble",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": "Daily Marketing Summary", "weight": "bold", "color": "#ffffff", "size": "lg"},
                {"type": "text", "text": f"Performance for {yesterday}", "color": "#ffffff", "size": "xs"}
            ],
            "backgroundColor": "#E62129"
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {"type": "text", "text": "Yesterday", "size": "xs", "color": "#aaaaaa"},
                                {"type": "text", "text": f"฿{total_spend:,.0f}", "weight": "bold", "size": "xl", "color": "#111111"},
                                {"type": "text", "text": f"{total_leads} Leads", "size": "sm", "color": "#E62129", "weight": "bold"}
                            ]
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {"type": "text", "text": "MTD Spend", "size": "xs", "color": "#aaaaaa", "align": "end"},
                                {"type": "text", "text": f"฿{mtd_spend:,.0f}", "weight": "bold", "size": "md", "color": "#111111", "align": "end"},
                                {"type": "text", "text": f"{mtd_leads} Leads", "size": "xs", "color": "#888888", "align": "end"}
                            ],
                            "justifyContent": "center"
                        }
                    ]
                },
                {"type": "separator", "margin": "lg"},
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {"type": "text", "text": "Category", "size": "xs", "color": "#aaaaaa", "flex": 4},
                        {"type": "text", "text": "Spend", "size": "xs", "color": "#aaaaaa", "align": "end", "flex": 3},
                        {"type": "text", "text": "Leads", "size": "xs", "color": "#aaaaaa", "align": "end", "flex": 2}
                    ],
                    "margin": "md"
                },
                *category_boxes
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "action": {
                        "type": "uri",
                        "label": "Open Dashboard",
                        "uri": f"{CRM_BASE_URL}/marketing/tracking"
                    },
                    "style": "primary",
                    "color": "#E62129"
                }
            ]
        }
    }
            
    send_line_alert(f"📊 Daily Summary for {yesterday}: ฿{total_spend:,.2f}", flex_contents=flex_bubble)
    print("✅ Daily Flex Summary Sent to LINE.")
    
    state['last_daily_summary_date'] = today_str
    with open(state_file, 'w', encoding='utf-8') as f:
        json.dump(state, f)

def run():
    print("🚀 Starting Incremental Facebook Ads Sync...")
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        sync_campaigns(conn, cur)
        sync_ads_and_adsets(conn, cur)
        sync_daily_metrics(conn, cur)
        check_and_send_daily_summary(cur)
        
        cur.close()
        conn.close()
        print("✨ Sync Complete!")
    except Exception as e:
        print(f"💥 Fatal Error: {e}")

if __name__ == "__main__":
    run()
