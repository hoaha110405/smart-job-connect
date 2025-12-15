// import { NestFactory } from "@nestjs/core";
// import { AppModule } from "./app.module";
// import cookieParser from "cookie-parser";
// import "dotenv/config";

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.use(cookieParser());

//   // DEV: allow all origins (NOT for production)
//   app.enableCors({
//     origin: true,
//     credentials: true,
//   });

//   await app.listen(process.env.PORT || 3000);
//   console.log("Server running on http://localhost:3000");
// }
// bootstrap();
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import cookieParser from "cookie-parser";
import "dotenv/config";
import { Request, Response, NextFunction } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  // --- Debug logger middleware: log every incoming request and origin
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin || "<no-origin>";
    console.log(
      `[CORS-DEBUG] ${new Date().toISOString()} => ${req.method} ${req.originalUrl} - Origin: ${origin}`,
    );
    // optionally log a few headers for diagnosis:
    console.log(`[CORS-DEBUG] headers:`, {
      origin: req.headers.origin,
      "access-control-request-method":
        req.headers["access-control-request-method"],
      "access-control-request-headers":
        req.headers["access-control-request-headers"],
      authorization: req.headers.authorization ? "present" : "absent",
      cookie: req.headers.cookie ? "present" : "absent",
    });
    next();
  });

  // --- Explicit CORS middleware: ALWAYS set these headers (debug mode)
  // --- Robust CORS debug middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const originHeader = req.headers.origin as string | undefined;
    const originToSend = originHeader || null;

    // Don't set "*" when credentials are used. Only set origin if present.
    if (originToSend) {
      res.setHeader("Access-Control-Allow-Origin", originToSend);
      // Helpful for caches/proxies
      res.setHeader("Vary", "Origin");
    } else {
      // If no origin provided (server-to-server), we can allow all — but avoid when credentials true in browser
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    // Methods
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    );

    // Echo requested headers if provided (more flexible)
    const reqHeaders = req.headers["access-control-request-headers"] as
      | string
      | undefined;
    if (reqHeaders) {
      res.setHeader("Access-Control-Allow-Headers", reqHeaders);
    } else {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie",
      );
    }

    // Credentials (cookies)
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Cache preflight for 1 hour
    res.setHeader("Access-Control-Max-Age", String(60 * 60));

    // Expose headers optionally
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, X-Kuma-Revision",
    );

    // Debug log
    console.log(
      "[CORS-DEBUG] origin:",
      originHeader,
      "AC-REQ-HEADERS:",
      reqHeaders,
    );

    if (req.method === "OPTIONS") {
      console.log("[CORS-DEBUG] OPTIONS handled -> 204");
      return res.status(204).end();
    }

    next();
  });

  // Keep your previous enableCors but it's okay to keep it or remove while debugging.
  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(process.env.PORT || 3000);
  console.log(`Server running on http://localhost:${process.env.PORT || 3000}`);
}
bootstrap();
