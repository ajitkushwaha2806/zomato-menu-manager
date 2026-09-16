const fs = require('fs');

const routePath = '/Users/ajitkushwaha3101/Desktop/app.getrepeat.in/src/app/api/restaurant/[id]/menu/import/zomato/route.js';
let routeContent = fs.readFileSync(routePath, 'utf8');

// Fix extraction
routeContent = routeContent.replace('} else if (itemData.media?.url) {', '} else if (Array.isArray(itemData.media) && itemData.media[0]?.image?.url) {\n                        zomatoImageUrl = itemData.media[0].image.url;\n                    } else if (itemData.media?.url) {');

// Fix media payload
routeContent = routeContent.replace('media: image ? [image] : [],', 'media: zomatoImageUrl ? [{ url: zomatoImageUrl, fileDirectory: "", image_id: zomatoImageUrl.split("?")[0].split("/").pop() || "" }] : [],');

fs.writeFileSync(routePath, routeContent);
console.log('Patched route.js');

const itemPath = '/Users/ajitkushwaha3101/Desktop/app.getrepeat.in/src/models/Item.js';
let itemContent = fs.readFileSync(itemPath, 'utf8');
itemContent = itemContent.replace('    media: [{\n      type: Schema.Types.ObjectId,\n      ref: "ImageAsset",\n    }],', '    media: [{ url: String, fileDirectory: String, image_id: String }],');
fs.writeFileSync(itemPath, itemContent);
console.log('Patched Item.js');
