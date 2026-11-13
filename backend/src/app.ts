import cors from "cors";
import express from "express";
import { env } from "./config/env";
import adminRoutes from "./routes/admin";
import adminCaseRoutes from "./routes/adminCases";
import adminDocumentRoutes from "./routes/adminDocuments";
import adminEmployeeRoutes from "./routes/adminEmployees";
import adminFirmLibraryRoutes from "./routes/adminFirmLibrary";
import adminFirmStagingRoutes from "./routes/adminFirmStaging";
import adminOnboardingRoutes from "./routes/adminOnboarding";
import adminSignaturesRoutes from "./routes/adminSignatures";
import adminEmailTemplatesRoutes from "./routes/adminEmailTemplates";
import adminSmtpRoutes from "./routes/adminSmtp";
import adminUsersRoutes from "./routes/adminUsers";
import authRoutes from "./routes/auth";
import clientRoutes from "./routes/client";
import clientCaseRoutes from "./routes/clientCases";
import clientDocumentRoutes from "./routes/clientDocuments";
import clientEmployeeRoutes from "./routes/clientEmployees";
import clientOnboardingRoutes from "./routes/clientOnboarding";
import clientSignaturesRoutes from "./routes/clientSignatures";
import clientUsersRoutes from "./routes/clientUsers";
import healthRoutes from "./routes/health";
import notificationRoutes from "./routes/notifications";
import profileRoutes from "./routes/profile";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (_req, res) => {
    res.status(200).json({
      success: true,
      data: { name: "DM.HR Portal API", version: "0.5.0" },
      message: "Part 4–5 auth + multi-user + documents + cases + onboarding + e-sign",
    });
  });

  app.use(healthRoutes);
  app.use(authRoutes);
  app.use(profileRoutes);
  app.use(notificationRoutes);
  app.use("/admin", adminRoutes);
  app.use("/admin", adminUsersRoutes);
  app.use("/admin", adminDocumentRoutes);
  app.use("/admin", adminEmployeeRoutes);
  app.use("/admin", adminCaseRoutes);
  app.use("/admin", adminSignaturesRoutes);
  app.use("/admin", adminFirmLibraryRoutes);
  app.use("/admin", adminFirmStagingRoutes);
  app.use("/admin", adminOnboardingRoutes);
  app.use("/admin", adminSmtpRoutes);
  app.use("/admin", adminEmailTemplatesRoutes);
  app.use("/client", clientRoutes);
  app.use("/client", clientUsersRoutes);
  app.use("/client", clientDocumentRoutes);
  app.use("/client", clientEmployeeRoutes);
  app.use("/client", clientCaseRoutes);
  app.use("/client", clientOnboardingRoutes);
  app.use("/client", clientSignaturesRoutes);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("Unhandled route error", err);
      if (res.headersSent) return;
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL", message: "Internal server error" },
      });
    }
  );

  return app;
}
