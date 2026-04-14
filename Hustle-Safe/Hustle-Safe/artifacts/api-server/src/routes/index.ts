import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import workersRouter from "./workers.js";
import zonesRouter from "./zones.js";
import policiesRouter from "./policies.js";
import claimsRouter from "./claims.js";
import simulatorRouter from "./simulator.js";
import analyticsRouter from "./analytics.js";
import premiumRouter from "./premium.js";
import notificationsRouter from "./notifications.js";
import stripeRouter from "./stripe.js";
import walletRouter from "./wallet.js";
import fraudRouter from "./fraud.js";

const router: IRouter = Router();

router.use("/fraud", fraudRouter);
router.use(healthRouter);
router.use(workersRouter);
router.use(zonesRouter);
router.use(policiesRouter);
router.use(claimsRouter);
router.use(simulatorRouter);
router.use(analyticsRouter);
router.use(premiumRouter);
router.use(notificationsRouter);
router.use(stripeRouter);
router.use(walletRouter);
export default router;
