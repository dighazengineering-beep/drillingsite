import { Router, type IRouter } from "express";
import healthRouter from "./health";
import servicesRouter from "./services";
import productsRouter from "./products";
import cartRouter from "./cart";
import inquiriesRouter from "./inquiries";
import catalogRouter from "./catalog";
import projectsRouter from "./projects";
import videoCommentsRouter from "./videoComments";
import videoStatsRouter from "./videoStats";
import feedVideosRouter from "./feedVideos";
import adminCatalogRouter from "./adminCatalog";
import membersRouter from "./members";

const router: IRouter = Router();

router.use(healthRouter);
router.use(servicesRouter);
router.use(productsRouter);
router.use(cartRouter);
router.use(inquiriesRouter);
router.use(catalogRouter);
router.use(projectsRouter);
router.use(videoCommentsRouter);
router.use(videoStatsRouter);
router.use(feedVideosRouter);
router.use(membersRouter);
router.use(adminCatalogRouter);

export default router;
