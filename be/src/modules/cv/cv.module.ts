import { forwardRef, Module } from "@nestjs/common";
import { CvService } from "./cv.service";
import { CvController } from "./cv.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { Cv, CvSchema } from "./schemas/cv.schema";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
// import { RagModule } from "../rag/rag.module";
import { Job, JobSchema } from "../job/schemas/job.schema";
import { RagModule } from "../rag/rag.module";
import { MulterModule } from "@nestjs/platform-express";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "..", "uploads"),
    }),
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }), // 10MB
    MongooseModule.forFeature([
      { name: Cv.name, schema: CvSchema },
      { name: Job.name, schema: JobSchema }, // <-- thêm nếu chưa có
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // eslint-disable-next-line @typescript-eslint/require-await
      useFactory: async (config: ConfigService) => ({
        secret: config.get("JWT_SECRET") || "dev-default-secret",
        signOptions: {
          expiresIn: config.get("JWT_EXPIRES_IN") || "3600s",
        },
      }),
    }),
    forwardRef(() => RagModule),
  ],
  controllers: [CvController],
  providers: [CvService],
  exports: [CvService],
})
export class CvModule {}
