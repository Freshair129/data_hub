import os
import pandas as pd
import psycopg2
import json
import re
from dotenv import load_dotenv

load_dotenv()

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text).strip('-')
    return text

def import_equipment():
    file_path = '/Users/ideab/Desktop/data_hub/อุปกรณ์.xlsx'
    db_url = os.getenv('DATABASE_URL')
    
    if not db_url:
        print("❌ DATABASE_URL not found in .env")
        return

    print(f"📖 Reading Excel: {file_path}")
    try:
        # Read excel, headers are in row 0
        df = pd.read_excel(file_path)
        
        # Mapping based on observation:
        # Equipment (Index 1) -> Name
        # Unnamed: 3 -> W (cm)
        # Unnamed: 4 -> L
        # Unnamed: 5 -> H
        # Unnamed: 6 -> Handle Length
        # Unnamed: 7 -> Weight (g)
        # Unnamed: 17 -> Price (FB/Web)
        
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        imported_count = 0
        
        # Start from index 1 as index 0 is sometimes header repetition or empty
        for index, row in df.iterrows():
            name = str(row.get('Equipment', '')).strip()
            if not name or name == 'Name' or name == 'nan':
                continue
                
            price = row.get('Unnamed: 17')
            try:
                price = float(price) if pd.notnull(price) else 0.0
            except:
                price = 0.0
                
            product_id = f"EQ-{slugify(name)}"
            
            # Metadata
            metadata = {
                "specs": {
                    "width_cm": str(row.get('Unnamed: 3')),
                    "length_cm": str(row.get('Unnamed: 4')),
                    "height_cm": str(row.get('Unnamed: 5')),
                    "handle_cm": str(row.get('Unnamed: 6')),
                    "weight_g": str(row.get('Unnamed: 7'))
                },
                "shipping": {
                    "box_size": str(row.get('Unnamed: 8')),
                    "box_weight": str(row.get('Unnamed: 9')),
                    "total_weight_g": str(row.get('Unnamed: 13'))
                },
                "source": "อุปกรณ์.xlsx"
            }
            
            # Upsert into products table
            # cuid() for id might be tricky from Python, we'll use a simple random string or let DB handle if it was default
            # But the schema says @id @default(cuid()). prisma handles this.
            # For direct SQL, we'll generate a temporary unique ID if needed or use productId as fallback for internal ID
            
            internal_id = f"prod_{product_id.lower()}"
            
            cur.execute("""
                INSERT INTO products (id, product_id, name, description, price, category, metadata, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (product_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    price = EXCLUDED.price,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW();
            """, (
                internal_id,
                product_id,
                name,
                "อุปกรณ์ครัวคุณภาพสูง สำหรับมืออาชีพ",
                price,
                "equipment",
                json.dumps(metadata),
                True
            ))
            
            imported_count += 1
            print(f"✅ Prepared: {name} ({price} THB)")

        conn.commit()
        print(f"\n✨ Successfully imported {imported_count} products.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if 'conn' in locals():
            cur.close()
            conn.close()

if __name__ == "__main__":
    import_equipment()
