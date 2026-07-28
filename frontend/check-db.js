const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const MenuSchema = new mongoose.Schema({}, { strict: false });
const Menu = mongoose.model('Menu', MenuSchema);
async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const menus = await Menu.find({});
  console.log(menus.map(m => ({ resId: m.resId, platform: m.platform, menuLength: m.menu?.length, id: m._id })));
  process.exit(0);
}
run();
