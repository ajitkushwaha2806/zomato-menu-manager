const mongoose = require('mongoose');
const MenuSync = require('./frontend/src/model/menu-sync').default || require('./frontend/src/model/menu-sync');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/zomato-menu-manager');
  const count = await MenuSync.countDocuments({});
  console.log("Total syncs:", count);
  const today = await MenuSync.find({ createdAt: { $gte: new Date('2026-08-19T18:30:00.000Z') } });
  console.log("Today syncs:", today.length);
  process.exit(0);
}
check();
