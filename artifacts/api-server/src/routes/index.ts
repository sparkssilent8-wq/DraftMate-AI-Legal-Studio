import { Router, type IRouter } from "express";
import draftmateRouter from "./draftmate";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(draftmateRouter);

export default router;
