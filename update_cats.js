const fs = require('fs');
const path = require('path');

const cat_map = {
    "TVS-JP01": "HC", "TVS-JP02": "HC", "TVS-JP03": "C", "TVS-JP04": "HR", "TVS-JP05": "C",
    "TVS-JP06": "C", "TVS-JP07": "HC", "TVS-JP08": "D", "TVS-JP09": "HC", "TVS-JP10": "HC",
    "TVS-JP11": "HC", "TVS-JP12": "HC", "TVS-JP13": "HC", "TVS-JP14": "HR", "TVS-JP15": "HC",
    "TVS-JP16": "HC", "TVS-JP17": "HC", "TVS-JP18": "D", "TVS-JP19": "C", "TVS-JP20": "HC",
    "TVS-SP01": "S", "TVS-MG01": "M", "TVS-AR01": "A"
};

const courses_dir = "/Users/ideab/Desktop/data_hub/products/courses";

fs.readdirSync(courses_dir).forEach(filename => {
    if (filename.endsWith(".json")) {
        const filePath = path.join(courses_dir, filename);
        let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        const course_id = data.id;
        if (cat_map[course_id]) {
            if (!data.metadata) data.metadata = {};
            data.metadata.functional_category = cat_map[course_id];

            fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
            console.log(`Updated ${filename} with cat ${cat_map[course_id]}`);
        }
    }
});
