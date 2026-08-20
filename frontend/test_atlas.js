require('dotenv').config();
const mongoose = require('mongoose');
const MenuSync = require('./src/model/menu-sync').default || require('./src/model/menu-sync');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const count = await MenuSync.countDocuments();
  console.log("Total syncs:", count);
  
  const d = new Date('2026-08-19T18:30:00.000Z');
  const d2 = new Date('2026-08-20T18:29:59.999Z');
  
  const pipeline = [
    {
      $match: {
        createdAt: {
          $gte: d,
          $lte: d2
        }
      }
    }
  ];
  
  const res = await MenuSync.aggregate(pipeline);
  console.log("Aggregated Today syncs:", res.length);
  
  const res2 = await MenuSync.find({ createdAt: { $gte: d, $lte: d2 } });
  console.log("Find Today syncs:", res2.length);
  
  if (res2.length > 0) {
      console.log("First sync:", res2[0].createdAt);
  } else {
      const last = await MenuSync.find().sort({createdAt: -1}).limit(1);
      if (last.length > 0) console.log("Very last sync in DB is from:", last[0].createdAt);
  }
  
  process.exit(0);
}
check();
