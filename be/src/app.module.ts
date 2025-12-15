import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { CvModule } from "./modules/cv/cv.module";
import { JobModule } from "./modules/job/job.module";
import { RagModule } from "./modules/rag/rag.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      String(process.env.MONGO_URI ?? "mongodb://localhost:27017/mydb"),
    ),
    UsersModule,
    AuthModule,
    RagModule,
    CvModule,
    JobModule,
  ],
})
export class AppModule {}
