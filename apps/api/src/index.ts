import { createApp } from "./app";
import type { Env } from "./env";
import { runDigest } from "./jobs/digest";
import { checkUsage, cleanup } from "./jobs/maintenance";
import { runRanking } from "./jobs/ranking";
import { services } from "./middleware";

const app = createApp();

export default {
  fetch: app.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const { db } = services(env);
    // 03:00 UTC: retention cleanup and usage alerts.
    if (controller.cron === "0 3 * * *") {
      ctx.waitUntil(
        (async () => {
          await cleanup(env, db);
          const alerts = await checkUsage(env, db);
          if (alerts.length) console.warn("[usage] alerts", alerts);
        })(),
      );
      return;
    }
    if (controller.cron === "*/30 * * * *") {
      ctx.waitUntil(
        (async () => {
          const result = await runRanking(db, controller.scheduledTime);
          console.log("[ranking]", JSON.stringify(result));
        })(),
      );
      return;
    }
    // 08:00, 08:20 and 08:40 UTC: digest batches (the later runs continue where the first stopped).
    ctx.waitUntil(
      (async () => {
        const result = await runDigest(env, db, controller.scheduledTime);
        console.log("[digest]", JSON.stringify(result));
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
