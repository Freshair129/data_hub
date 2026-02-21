import os
import psycopg2
import json
from dotenv import load_dotenv

load_dotenv()

UNIFORM_PRODUCTS = [
    {
        "product_id": "TVS-EQ-CHEF-JACKET",
        "name": "เสื้อเชฟ (Chef Jacket)",
        "description": "เสื้อเชฟสีขาว ปักโลโก้ V School",
        "category": "equipment",
        "price": 0, # Bundle price is included in course
        "isActive": True
    },
    {
        "product_id": "TVS-EQ-APRON-HAT",
        "name": "ชุดผ้ากันเปื้อนและหมวก (Apron & Hat Set)",
        "description": "ผ้ากันเปื้อนและหมวกเชฟ ครบชุด",
        "category": "equipment",
        "price": 0,
        "isActive": True
    }
]

FULL_COURSES = ["TVS-FC-FULL-COURSES-A-111H", "TVS-FC-FULL-COURSES-B-201H"]

def run_migration():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL not found")
        return

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # 1. Insert Uniform Products
    print("🔄 Inserting uniform products...")
    for p in UNIFORM_PRODUCTS:
        # Generate a cuid-like string (c + 24 random hex chars)
        import secrets
        cuid = "c" + secrets.token_hex(12)
        
        cur.execute("""
            INSERT INTO products (id, product_id, name, description, category, price, is_active, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT (product_id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                updated_at = NOW()
        """, (cuid, p['product_id'], p['name'], p['description'], p['category'], p['price'], p['isActive']))
        print(f"  ✅ {p['product_id']} added/updated")

    # 2. Update Full Course Bundled Items
    print("\n🔄 Updating Full Course bundling metadata...")
    for fc_id in FULL_COURSES:
        cur.execute("SELECT metadata FROM products WHERE product_id = %s", (fc_id,))
        row = cur.fetchone()
        if not row:
            print(f"  ⚠️ Full Course not found: {fc_id}")
            continue

        metadata = row[0] if row[0] else {}
        if isinstance(metadata, str):
            metadata = json.loads(metadata)

        # Get existing items or start fresh
        bundled = metadata.get("bundled_items", {"courses": [], "equipment": []})
        eq_list = bundled.get("equipment", [])

        # Add or update uniform items in the bundle
        uniforms_to_add = [
            {"id": "TVS-EQ-CHEF-JACKET", "name": "เสื้อเชฟ 2 ชุด (Chef Jacket)", "qty": 2},
            {"id": "TVS-EQ-APRON-HAT", "name": "ชุดผ้ากันเปื้อน+หมวก 4 ชุด (Apron & Hat Set)", "qty": 4}
        ]

        # Filter out old versions if they exist
        new_eq_list = [item for item in eq_list if item['id'] not in ["TVS-EQ-CHEF-JACKET", "TVS-EQ-APRON-HAT"]]
        new_eq_list.extend(uniforms_to_add)

        bundled["equipment"] = new_eq_list
        metadata["bundled_items"] = bundled

        cur.execute(
            "UPDATE products SET metadata = %s, updated_at = NOW() WHERE product_id = %s",
            (json.dumps(metadata), fc_id)
        )
        print(f"  ✅ {fc_id} updated with uniforms")

    conn.commit()
    cur.close()
    conn.close()
    print("\n✨ Done!")

if __name__ == "__main__":
    run_migration()
