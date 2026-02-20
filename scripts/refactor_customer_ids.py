import os
import json
import shutil
from datetime import datetime

# Configuration
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(BASE_DIR, 'customer')
BACKUP_DIR = os.path.join(BASE_DIR, 'customer_backup_' + datetime.now().strftime('%Y%m%d_%H%M%S'))

def refactor_ids():
    print(f"--- Customer ID Standardization (TVS-CUS Stable V7) ---")
    
    if not os.path.exists(DATA_DIR):
        print(f"❌ DATA_DIR not found: {DATA_DIR}")
        return

    # 1. Backup
    print(f"[1/4] Creating backup at {BACKUP_DIR}...")
    shutil.copytree(DATA_DIR, BACKUP_DIR)

    # 2. Collect all customers and sort by join_date or folder name
    customers = []
    folders = [f for f in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, f))]
    
    for folder in folders:
        profile_path = os.path.join(DATA_DIR, folder, f"profile_{folder}.json")
        if os.path.exists(profile_path):
            try:
                with open(profile_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # Determine Channel
                channel = "WB"
                cinfo = data.get('contact_info', {})
                if cinfo.get('facebook_id') or cinfo.get('facebook'): channel = "FB"
                elif cinfo.get('line_id') or cinfo.get('line'): channel = "LN"
                
                # Get Join Year
                join_date = data.get('profile', {}).get('join_date', '2026')
                year = join_date[2:4] if len(join_date) >= 4 else "26"
                
                customers.append({
                    "old_id": folder,
                    "path": profile_path,
                    "folder_path": os.path.join(DATA_DIR, folder),
                    "channel": channel,
                    "year": year,
                    "data": data
                })
            except Exception as e:
                print(f"  [Error] Failed to read {folder}: {e}")

    # Sort customers to assign serials predictably
    customers.sort(key=lambda x: (x['year'], x['old_id']))

    # 3. Assign New IDs and Update JSONs
    print(f"[2/4] Assigning new IDs and updating JSON content...")
    id_map = {} # old_id -> new_id
    serial_counters = {} # (channel, year) -> counter

    for cust in customers:
        key = (cust['channel'], cust['year'])
        serial_counters[key] = serial_counters.get(key, 0) + 1
        new_id = f"TVS-CUS-{cust['channel']}-{cust['year']}-{serial_counters[key]:04d}"
        
        cust['new_id'] = new_id
        id_map[cust['old_id']] = new_id
        
        # Update JSON Content
        cust['data']['customer_id'] = new_id
        # If it's a conversation-based folder, also update conversation_id if it matched old_id
        if cust['data'].get('conversation_id') == cust['old_id']:
            cust['data']['conversation_id'] = new_id # Keep mapping intact if needed, or keep original?
            # Actually, conversation_id should probably stay linked to FB if possible, 
            # but usually it matches the folder for sync reasons.
        
        with open(cust['path'], 'w', encoding='utf-8') as f:
            json.dump(cust['data'], f, indent=4, ensure_ascii=False)
            
        # Rename original profile file inside folder
        new_profile_path = os.path.join(cust['folder_path'], f"profile_{new_id}.json")
        os.rename(cust['path'], new_profile_path)
        
        # Rename conversation history files if they use old_id in filename
        hist_dir = os.path.join(cust['folder_path'], 'chathistory')
        if os.path.exists(hist_dir):
            for f in os.listdir(hist_dir):
                if cust['old_id'] in f:
                    new_f = f.replace(cust['old_id'], new_id)
                    os.rename(os.path.join(hist_dir, f), os.path.join(hist_dir, new_f))

    # 4. Rename Folders
    print(f"[3/4] Renaming folders...")
    for cust in customers:
        new_folder_path = os.path.join(DATA_DIR, cust['new_id'])
        if os.path.exists(new_folder_path):
            print(f"  [Warning] Collision: {new_folder_path} exists! Merging...")
            # For simplicity, move subfiles. In real scenario, would need careful merge.
            for item in os.listdir(cust['folder_path']):
                shutil.move(os.path.join(cust['folder_path'], item), os.path.join(new_folder_path, item))
            os.rmdir(cust['folder_path'])
        else:
            os.rename(cust['folder_path'], new_folder_path)

    # 5. Save ID Mapping for reference
    mapping_file = os.path.join(BASE_DIR, 'crm-app', 'docs', 'customer_id_mapping.json')
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(id_map, f, indent=4)

    print(f"[4/4] Finished. {len(customers)} customers refactored.")
    print(f"Mapping saved to {mapping_file}")

if __name__ == "__main__":
    refactor_ids()
