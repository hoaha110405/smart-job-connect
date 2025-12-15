// src/job/job.module.ts
import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Job, JobSchema } from "./schemas/job.schema";
import { JobService } from "./job.service";
import { JobController } from "./job.controller";
// import { RagModule } from "../rag/rag.module";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Cv, CvSchema } from "../cv/schemas/cv.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: Cv.name, schema: CvSchema },
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
    // forwardRef(() => RagModule),
  ],
  providers: [JobService],
  controllers: [JobController],
  exports: [JobService],
})
export class JobModule {}
