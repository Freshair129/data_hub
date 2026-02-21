const fs = require('fs');
const path = require('path');

const packagesDir = path.join(__dirname, 'products/packages');
const coursesDir = path.join(__dirname, 'products/courses');
const imagesDir = path.join(__dirname, 'packages_picture');
const catalogFile = path.join(__dirname, 'catalog.json');

const catalog = {
    packages: [],
    products: []
};

// Process Packages
const packageFiles = fs.readdirSync(packagesDir).filter(f => f.endsWith('.json'));
for (const file of packageFiles) {
    const content = fs.readFileSync(path.join(packagesDir, file), 'utf8');
    const pkg = JSON.parse(content);

    // Check for image - Prioritize JPG (Marketing Poster)
    let imagePath = null;
    if (fs.existsSync(path.join(imagesDir, `${pkg.id}.jpg`))) {
        imagePath = `/images/packages/${pkg.id}.jpg`;
    } else if (fs.existsSync(path.join(imagesDir, `${pkg.id}.png`))) {
        imagePath = `/images/packages/${pkg.id}.png`;
    } else if (fs.existsSync(path.join(imagesDir, `${pkg.id}.webp`))) {
        imagePath = `/images/packages/${pkg.id}.webp`;
    }

    // Add fields needed for StoreGrid
    catalog.packages.push({
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        price: pkg.price,
        base_price: pkg.base_price,
        image: imagePath,
        category: pkg.category,
        duration: pkg.duration,
        duration_unit: pkg.duration_unit,
        metadata: pkg.metadata
    });
}

// Process Courses
const courseFiles = fs.readdirSync(coursesDir).filter(f => f.endsWith('.json'));
for (const file of courseFiles) {
    const content = fs.readFileSync(path.join(coursesDir, file), 'utf8');
    const course = JSON.parse(content);

    // Add fields needed for StoreGrid
    catalog.products.push({
        id: course.id,
        name: course.name,
        description: course.description,
        price: course.price,
        base_price: course.price, // Courses usually don't have separate base price in current schema, defaulting to price
        image: null, // Placeholder will be used by UI
        category: course.category,
        duration: course.duration,
        duration_unit: course.duration_unit,
        metadata: course.metadata
    });
}

fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 4));
console.log(`Generated catalog.json with ${catalog.packages.length} packages and ${catalog.products.length} courses.`);
