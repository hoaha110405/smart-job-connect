/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Post,
  Param,
  Get,
  Body,
  Query,
  BadRequestException,
  Logger,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import { RagService } from "./rag.service";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Cv } from "../cv/schemas/cv.schema";
import { Job } from "../job/schemas/job.schema";

@Controller("rag")
export class RagController {
  private readonly logger = new Logger(RagController.name);
  constructor(
    private readonly rag: RagService,
    @InjectModel(Cv.name) private readonly cvModel: Model<Cv>,
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
  ) {}

  // --------------------------
  // CV INDEXING
  // --------------------------

  @Post("index-cv/:id")
  async indexCv(@Param("id") id: string) {
    if (!id) throw new BadRequestException("id is required");
    return this.rag.indexCv(id);
  }

  @Post("index-all-cv")
  async indexAllCv() {
    return this.rag.indexAllCvsReport();
  }

  // --------------------------
  // JOB INDEXING
  // --------------------------

  @Post("index-job/:id")
  async indexJob(@Param("id") id: string) {
    if (!id) throw new BadRequestException("id is required");
    return this.rag.indexJob(id);
  }

  @Post("index-all-job")
  async indexAllJob() {
    return this.rag.indexAllJobsReport();
  }

  // --------------------------
  // RAG QUERY / Chatbot
  // --------------------------

  @Post("ask")
  async ask(@Body() body: any) {
    const question = body?.question;
    if (!question) throw new BadRequestException("question is required");
    const topK = Number(body?.topK ?? 5);
    return this.rag.answer(question, topK);
  }

  // Simple debug: retrieve only (no LLM)
  @Get("retrieve")
  async retrieve(@Query("q") q: string, @Query("topK") topK = 5) {
    if (!q) throw new BadRequestException("q (query) is required");
    return this.rag.retrieve(q, Number(topK));
  }

  // --------------------------
  // JOB <-> CV MATCHING endpoints
  // --------------------------

  /**
   * GET /rag/match-all-cvs-for-job-doc/:jobId
   * Match ALL CVs for a Job (doc-level embedding, paginated)
   */
  @Get("match-all-cvs-for-job-doc/:jobId")
  async matchAllCvsForJobDocLevel(
    @Param("jobId") jobId: string,

    @Query("topK")
    topK?: number,

    @Query("page", new DefaultValuePipe(1), ParseIntPipe)
    page?: number,

    @Query("limit", new DefaultValuePipe(10), ParseIntPipe)
    limit?: number,
  ) {
    return this.rag.matchAllCvsForJobDocLevel(jobId, topK, page, limit);
  }

  /**
   * GET /rag/match-all-jobs-for-cv-doc/:cvId
   * Match ALL Jobs for a CV (doc-level embedding, paginated)
   */
  @Get("match-all-jobs-for-cv-doc/:cvId")
  async matchAllJobsForCvDocLevel(
    @Param("cvId") cvId: string,

    @Query("topK")
    topK?: number,

    @Query("page", new DefaultValuePipe(1), ParseIntPipe)
    page?: number,

    @Query("limit", new DefaultValuePipe(10), ParseIntPipe)
    limit?: number,
  ) {
    return this.rag.matchAllJobsForCvDocLevel(cvId, topK, page, limit);
  }

  /**
   * GET /rag/match-job-cv-chunks/:jobId/:cvId
   * Chunk-level semantic matching giữa 1 Job và 1 CV
   * - topK: số lượng cặp sau khi lọc + sort
   * - minScore: filter score cuối (0–1) nhưng không xoá dữ liệu gốc
   * - minSkillScore: filter skill (0–1)
   * - requireSkillOverlap: true => loại bỏ các cặp không có skill match
   */
  @Get("match-job-cv-chunks/:jobId/:cvId")
  async matchJobCvChunks(
    @Param("jobId") jobId: string,
    @Param("cvId") cvId: string,

    @Query("topK", new DefaultValuePipe(10), ParseIntPipe)
    topK: number,

    @Query("minScore") minScore?: string,
    @Query("minSkillScore") minSkillScore?: string,
    @Query("requireSkillOverlap") requireSkillOverlap?: string,
  ) {
    if (!jobId || !cvId) throw new BadRequestException("jobId & cvId required");

    const opts = {
      minScore: minScore ? Number(minScore) : undefined,
      minSkillScore: minSkillScore ? Number(minSkillScore) : undefined,
      requireSkillOverlap: requireSkillOverlap === "true",
    };

    // NOTE: service still computes allPairs and finalOverallScore; controller just returns that.
    return this.rag.matchJobCvChunkLevel(jobId, cvId, topK, opts);
  }
}
