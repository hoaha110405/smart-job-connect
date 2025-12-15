import { Module } from "@nestjs/common";
import { RagService } from "./rag.service";
import { RagController } from "./rag.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { Embedding, EmbeddingSchema } from "./schemas/embedding.schema";
import { Cv, CvSchema } from "../cv/schemas/cv.schema";
import { ConfigModule } from "@nestjs/config";
import { OpenAIService } from "./openai.service";
import { Job, JobSchema } from "../job/schemas/job.schema";

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Embedding.name, schema: EmbeddingSchema },
    ]),
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: Cv.name, schema: CvSchema },
    ]),
  ],
  providers: [OpenAIService, RagService],
  controllers: [RagController],
  exports: [OpenAIService, RagService],
})
export class RagModule {}
