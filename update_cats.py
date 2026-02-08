import json
import os

cat_map = {
    "TVS-JP01": "HC", "TVS-JP02": "HC", "TVS-JP03": "C", "TVS-JP04": "HR", "TVS-JP05": "C",
    "TVS-JP06": "C", "TVS-JP07": "HC", "TVS-JP08": "D", "TVS-JP09": "HC", "TVS-JP10": "HC",
    "TVS-JP11": "HC", "TVS-JP12": "HC", "TVS-JP13": "HC", "TVS-JP14": "HR", "TVS-JP15": "HC",
    "TVS-JP16": "HC", "TVS-JP17": "HC", "TVS-JP18": "D", "TVS-JP19": "C", "TVS-JP20": "HC",
    "TVS-SP01": "S", "TVS-MG01": "M", "TVS-AR01": "A"
}

courses_dir = "/Users/ideab/Desktop/data_hub/products/courses"

for filename in os.listdir(courses_dir):
    if filename.endswith(".json"):
        path = os.path.join(courses_dir, filename)
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        course_id = data.get("id")
        if course_id in cat_map:
            if "metadata" not in data:
                data["metadata"] = {}
            data["metadata"]["functional_category"] = cat_map[course_id]
            
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print(f"Updated {filename} with cat {cat_map[course_id]}")
