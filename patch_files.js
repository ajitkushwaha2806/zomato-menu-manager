const fs = require('fs');

const routePath = '/Users/ajitkushwaha3101/Desktop/app.getrepeat.in/src/app/api/restaurant/[id]/menu/import/zomato/route.js';
let routeContent = fs.readFileSync(routePath, 'utf8');
routeContent = routeContent.replace('image: image,', 'image: image,\n                        media: image ? [image] : [],');
fs.writeFileSync(routePath, routeContent);
console.log('Patched route.js');

const itemPath = '/Users/ajitkushwaha3101/Desktop/app.getrepeat.in/src/models/Item.js';
let itemContent = fs.readFileSync(itemPath, 'utf8');
if (!itemContent.includes('media: [')) {
    itemContent = itemContent.replace('image: {', 'media: [{\n      type: Schema.Types.ObjectId,\n      ref: "ImageAsset",\n    }],\n    image: {');
    fs.writeFileSync(itemPath, itemContent);
    console.log('Patched Item.js');
} else {
    console.log('Item.js already has media');
}
