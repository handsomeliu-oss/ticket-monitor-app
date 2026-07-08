import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT || "8787", 10);
const app = createApp({ startScheduler: process.env.DISABLE_SCHEDULER !== "1" });

app.listen(port, () => {
  console.log(`ticket alert cloud backend listening on ${port}`);
});
