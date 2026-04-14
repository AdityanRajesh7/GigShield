import { db, zonesTable, workersTable } from "./lib/db/src/index.js";

async function run() {
  console.log("Zones:");
  const zones = await db.select().from(zonesTable);
  console.log(zones.map(z => ({ id: z.id, name: z.name })));

  console.log("Worker:");
  const workers = await db.select().from(workersTable);
  console.log(workers.find(w => w.phone === "+919999999999"));
  process.exit(0);
}
run();
