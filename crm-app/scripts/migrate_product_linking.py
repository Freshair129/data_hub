import os
import psycopg2
import json
from dotenv import load_dotenv

load_dotenv()

# ─── Equipment ID Rename Map ───────────────────────────────────
EQ_RENAME = {
    "EQ-มดเดบะ-18-เซนตเมตร-มอขวา":          "TVS-EQ-DEBA-18R",
    "EQ-มดเดบะขนปลา-ดามพลาสตก-มอขวา":       "TVS-EQ-DEBA-PL-R",
    "EQ-มดยานางบะ-27-ซม-มอขวา":              "TVS-EQ-YANAGI-27R",
    "EQ-มดยานางบะ-30-ซม-มอขวา":              "TVS-EQ-YANAGI-30R",
    "EQ-มดเดบะขนปลาญปนดานไม-มอซาย":         "TVS-EQ-DEBA-WD-L",
    "EQ-มดซาซมแสตนเลสดานไม-มอซาย":          "TVS-EQ-SASHIMI-WD-L",
    "EQ-กระทะโอยาโกะดง":                      "TVS-EQ-OYAKODON-PAN",
    "EQ-ทฝนขงอลมเนยม":                       "TVS-EQ-GINGER-GRATER",
    "EQ-หนลบมดญปน-สแดง":                     "TVS-EQ-WHETSTONE-RED",
    "EQ-ทขอดเกลดปลาทองเหลอง":                "TVS-EQ-SCALER-BRASS",
    "EQ-ทคบกางปลาแสตเลส-120มม":              "TVS-EQ-BONE-TWEEZER",
    "EQ-ทไสผกสารพดประโยชน":                   "TVS-EQ-VEGGIE-SLICER",
    "EQ-กระทะสเหลยมทำไขหวานญปน":             "TVS-EQ-TAMAGOYAKI-PAN",
    "EQ-แผนพลาสตก-90045025":                  "TVS-EQ-BOARD-900",
    "EQ-แผนพลาสตก-40045025":                  "TVS-EQ-BOARD-400",
    "EQ-กระบะไมผสมขาวซช-handai-39cm":         "TVS-EQ-HANDAI-39",
    "EQ-กระบะไมผสมขาวซช-handai-33cm":         "TVS-EQ-HANDAI-33",
    "EQ-ทฝนวาซาบสด":                         "TVS-EQ-WASABI-GRATER",
    "EQ-ทขอดเกลดสแตนเลส":                    "TVS-EQ-SCALER-SS",
    "EQ-หมออนขาวเนอเหลกพรอมฟา":              "TVS-EQ-RICE-WARMER",
    "EQ-หวเบรนอาหารอยางดหมนได":              "TVS-EQ-TORCH-BURNER",
}

# ─── Package Bundle Definitions ────────────────────────────────
PACKAGE_BUNDLES = {
    "TVS-PKG01-BUFFET-30H": {
        "courses": [
            {"id": "TVS-JP-2FC-HO-13", "name": "ยากินิกุ", "type": "required"},
            {"id": "TVS-JP-2FC-HC-01", "name": "อาหารญี่ปุ่นพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-HO-10", "name": "ชาบู ชาบู", "type": "required"},
            {"id": "TVS-JP-2FC-HO-11", "name": "เกี๊ยวซ่า แป้งสด", "type": "elective", "group": "A"},
            {"id": "TVS-JP-2FC-HC-12", "name": "อิซากาย่า", "type": "elective", "group": "A"},
            {"id": "TVS-JP-2FC-HO-09", "name": "ทาโกะยากิ", "type": "bonus"},
        ],
        "equipment": []
    },
    "TVS-PKG02-DELIVERY-39H": {
        "courses": [
            {"id": "TVS-JP-1FC-HC-20", "name": "ทักษะพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-HC-01", "name": "อาหารญี่ปุ่นพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-HR-02", "name": "อาหารญี่ปุ่นพื้นบ้าน", "type": "required"},
            {"id": "TVS-JP-2FC-DS-08", "name": "ขนมหวานญี่ปุ่น", "type": "bonus"},
        ],
        "equipment": []
    },
    "TVS-PKG03-RAMEN-39H": {
        "courses": [
            {"id": "TVS-JP-1FC-HC-20", "name": "ทักษะพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-HC-01", "name": "อาหารญี่ปุ่นพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-HN-04", "name": "ราเมนมืออาชีพ", "type": "required"},
            {"id": "TVS-JP-2FC-CO-15", "name": "น้ำสลัดยอดนิยม", "type": "elective", "group": "A"},
            {"id": "TVS-JP-2FC-HN-14", "name": "ราเมนเส้นสด", "type": "elective", "group": "A"},
        ],
        "equipment": []
    },
    "TVS-PKG04-CAFE-42H": {
        "courses": [
            {"id": "TVS-JP-1FC-DS-18", "name": "ขนมหวาน 4 ฤดู", "type": "required"},
            {"id": "TVS-JP-2FC-HR-07", "name": "ดงบูริ ข้าวหน้า", "type": "required"},
            {"id": "TVS-JP-1FC-HO-16", "name": "คัตสึเร็ตสึ", "type": "required"},
            {"id": "TVS-MG-1FC-MG-01", "name": "บริหารจัดการครัว", "type": "elective", "group": "A"},
            {"id": "TVS-JP-2FC-HO-13", "name": "ยากินิกุ", "type": "elective", "group": "A"},
        ],
        "equipment": []
    },
    "TVS-PKG05-HOTKITCHEN-63H": {
        "courses": [
            {"id": "TVS-JP-1FC-HC-20", "name": "ทักษะพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-HC-01", "name": "อาหารญี่ปุ่นพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-1FC-HR-17", "name": "เทปันยากิ", "type": "required"},
            {"id": "TVS-JP-2FC-HN-04", "name": "ราเมนมืออาชีพ", "type": "required"},
            {"id": "TVS-MG-1FC-MG-01", "name": "บริหารจัดการครัว", "type": "bonus"},
            {"id": "TVS-JP-2FC-HN-14", "name": "ราเมนเส้นสด", "type": "bonus"},
        ],
        "equipment": []
    },
    "TVS-PKG06-ABROAD-63H": {
        "courses": [
            {"id": "TVS-JP-1FC-HC-20", "name": "ทักษะพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-HC-01", "name": "อาหารญี่ปุ่นพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-SC-03", "name": "ซูชิและซาซิมิ", "type": "required"},
            {"id": "TVS-JP-2FC-SC-05", "name": "แล่ปลาแซลมอน", "type": "required"},
            {"id": "TVS-MG-1FC-MG-01", "name": "บริหารจัดการครัว", "type": "elective", "group": "A"},
            {"id": "TVS-JP-2FC-HR-07", "name": "ดงบูริ ข้าวหน้า", "type": "elective", "group": "A"},
            {"id": "TVS-JP-1FC-HO-16", "name": "คัตสึเร็ตสึ", "type": "elective", "group": "A"},
        ],
        "equipment": []
    },
    "TVS-PKG07-PROCHEF-78H": {
        "courses": [
            {"id": "TVS-JP-1FC-HC-20", "name": "ทักษะพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-HC-01", "name": "อาหารญี่ปุ่นพื้นฐาน", "type": "required"},
            {"id": "TVS-JP-2FC-SC-03", "name": "ซูชิและซาซิมิ", "type": "required"},
            {"id": "TVS-JP-2FC-SC-05", "name": "แล่ปลาแซลมอน", "type": "required"},
            {"id": "TVS-JP-1FC-SC-19", "name": "โอมากาเสะปลาไทย", "type": "required"},
            {"id": "TVS-MG-1FC-MG-01", "name": "บริหารจัดการครัว", "type": "bonus"},
            {"id": "TVS-JP-2FC-DS-08", "name": "ขนมหวานญี่ปุ่น", "type": "bonus"},
            {"id": "TVS-JP-2FC-SC-06", "name": "ฟิวชัน ซูชิ", "type": "bonus"},
        ],
        "equipment": []
    },
}

# ─── Full Course Equipment Bundles ──────────────────────────────
FULL_COURSE_EQUIPMENT = {
    "TVS-FC-FULL-COURSES-A-111H": [
        {"id": "TVS-EQ-DEBA-18R", "name": "Deba Knife 18cm (Right)", "qty": 1},
        {"id": "TVS-EQ-YANAGI-30R", "name": "Yanagiba 30cm (Right)", "qty": 1},
        {"id": "TVS-EQ-WHETSTONE-RED", "name": "Red Whetstone", "qty": 1},
        {"id": "TVS-EQ-VEGGIE-SLICER", "name": "Veggie Slicer", "qty": 1},
    ],
    "TVS-FC-FULL-COURSES-B-201H": [
        {"id": "TVS-EQ-DEBA-18R", "name": "Deba Knife 18cm (Right)", "qty": 1},
        {"id": "TVS-EQ-YANAGI-30R", "name": "Yanagiba 30cm (Right)", "qty": 1},
        {"id": "TVS-EQ-WHETSTONE-RED", "name": "Red Whetstone", "qty": 1},
        {"id": "TVS-EQ-VEGGIE-SLICER", "name": "Veggie Slicer", "qty": 1},
    ],
}


def run_migration():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL not found")
        return

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # ── Step 1: Rename Equipment IDs ────────────────────────────
    print("🔄 Step 1: Renaming equipment product IDs...")
    renamed = 0
    for old_id, new_id in EQ_RENAME.items():
        cur.execute("UPDATE products SET product_id = %s, updated_at = NOW() WHERE product_id = %s", (new_id, old_id))
        if cur.rowcount > 0:
            renamed += 1
            print(f"  ✅ {old_id} → {new_id}")
        else:
            # Try matching with the internal id pattern
            cur.execute("SELECT product_id FROM products WHERE product_id LIKE %s", (f"EQ-%",))
    print(f"  📊 Renamed {renamed} equipment IDs")

    # ── Step 2: Add bundled_items to Packages ───────────────────
    print("\n🔄 Step 2: Adding bundled_items to packages...")
    for pkg_id, bundle in PACKAGE_BUNDLES.items():
        cur.execute("SELECT metadata FROM products WHERE product_id = %s", (pkg_id,))
        row = cur.fetchone()
        if not row:
            print(f"  ⚠️ Package not found: {pkg_id}")
            continue

        metadata = row[0] if row[0] else {}
        if isinstance(metadata, str):
            metadata = json.loads(metadata)

        metadata["bundled_items"] = bundle
        cur.execute(
            "UPDATE products SET metadata = %s, updated_at = NOW() WHERE product_id = %s",
            (json.dumps(metadata), pkg_id)
        )
        print(f"  ✅ {pkg_id}: {len(bundle['courses'])} courses, {len(bundle['equipment'])} equipment")

    # ── Step 3: Add bundled_items to Full Courses ───────────────
    print("\n🔄 Step 3: Adding equipment to Full Courses...")
    for fc_id, equipment in FULL_COURSE_EQUIPMENT.items():
        cur.execute("SELECT metadata FROM products WHERE product_id = %s", (fc_id,))
        row = cur.fetchone()
        if not row:
            print(f"  ⚠️ Full Course not found: {fc_id}")
            continue

        metadata = row[0] if row[0] else {}
        if isinstance(metadata, str):
            metadata = json.loads(metadata)

        metadata["bundled_items"] = {"courses": [], "equipment": equipment}
        cur.execute(
            "UPDATE products SET metadata = %s, updated_at = NOW() WHERE product_id = %s",
            (json.dumps(metadata), fc_id)
        )
        print(f"  ✅ {fc_id}: {len(equipment)} equipment items linked")

    conn.commit()
    cur.close()
    conn.close()
    print("\n✨ Migration complete!")


if __name__ == "__main__":
    run_migration()
