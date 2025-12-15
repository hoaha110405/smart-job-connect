// src/modules/job/job.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Job, JobDocument } from "./schemas/job.schema";
import { CreateJobDto } from "./dto/create-job.dto";
import { UpdateJobDto } from "./dto/update-job.dto";
import { Cv } from "../cv/schemas/cv.schema";
// import { PineconeService } from "../rag/pinecone.service";
// import { OpenAIService } from "../rag/openai.service";
import { Model as MModel } from "mongoose";
// import { RagService } from "../rag/rag.service";

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);
  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<JobDocument>,
    @InjectModel(Cv.name) private readonly cvModel: MModel<Cv>,
    // private readonly openAiService: OpenAIService,
    // private readonly pinecone: PineconeService,
    // @Inject(forwardRef(() => RagService))
    // private readonly rag: RagService,
  ) {}

  /**
   * Create job and index it in RAG (indexing errors are caught and do not fail creation)
   */
  async create(createDto: CreateJobDto, userId: string) {
    try {
      const payload = {
        ...createDto,
        createdBy: userId,
      };
      const doc = new this.jobModel(payload);
      const saved = await doc.save();

      // Index job in RAG — await but do not let indexing errors break job creation
      // try {
      //   await this.rag.indexJob(saved._id.toString());
      //   this.logger.log(`Job ${saved._id} indexed in RAG.`);
      // } catch (indexErr) {
      //   this.logger.error(
      //     `Failed to index Job ${saved._id} in RAG: ${String(indexErr)}`,
      //   );
      // }

      return saved;
    } catch (err) {
      throw new BadRequestException(err ?? "Failed to create job");
    }
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    filters?: any;
    search?: string;
    sort?: string; // "latest" | "oldest"
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.max(1, Math.min(100, options?.limit ?? 20));
    const skip = (page - 1) * limit;
    const filters = options?.filters ? { ...options.filters } : {};

    if (options?.search && options.search.trim() !== "") {
      const q = options.search.trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filters.$or = [
        { title: regex },
        { companyName: regex },
        { description: regex },
        { "skills.name": regex },
      ];
    }

    let sortOption: any = { createdAt: -1 }; // default newest first
    if (options?.sort === "oldest") sortOption = { createdAt: 1 };
    if (options?.sort === "latest") sortOption = { createdAt: -1 };

    const query = this.jobModel
      .find(filters)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const [items, total] = await Promise.all([
      query.exec(),
      this.jobModel.countDocuments(filters).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, populateCreator = false) {
    const q = this.jobModel.findById(id);
    if (populateCreator) q.populate("createdBy", "fullname email");
    const doc = await q.exec();
    if (!doc) throw new NotFoundException(`Job ${id} not found`);
    return doc;
  }

  async update(id: string, payload: UpdateJobDto) {
    const doc = await this.jobModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!doc) throw new NotFoundException(`Job ${id} not found`);
    return doc;
  }

  async remove(id: string) {
    const doc = await this.jobModel.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException(`Job ${id} not found`);
    return { deleted: true, id };
  }

  async findByUser(userId: string) {
    if (!userId) throw new BadRequestException("Missing userId");
    return this.jobModel
      .find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async rename(id: string, newTitle: string) {
    if (!newTitle || newTitle.trim() === "") {
      throw new BadRequestException("New title is required");
    }

    const doc = await this.jobModel
      .findByIdAndUpdate(
        id,
        { title: newTitle, updatedAt: new Date() },
        { new: true },
      )
      .exec();

    if (!doc) throw new NotFoundException(`Job ${id} not found`);
    return doc;
  }

  // async matchCvs(
  //   jobId: string,
  //   topK = 50,
  //   page = 1,
  //   limit = 10,
  //   sort: "best" | "worst" = "best",
  // ) {
  //   // 1) Load job
  //   const job = await this.jobModel.findById(jobId).lean();
  //   if (!job) throw new NotFoundException("Job not found");

  //   // 2) Build query text (explicit joins)
  //   const skillText =
  //     Array.isArray(job.skills) && job.skills.length
  //       ? job.skills
  //           .map((s: any) => (typeof s === "string" ? s : s.name))
  //           .join(", ")
  //       : "";

  //   const reqText =
  //     Array.isArray(job.requirements) && job.requirements.length
  //       ? job.requirements.join("\n")
  //       : (job.requirements ?? "");

  //   const textForQuery = [
  //     job.title ?? "",
  //     job.description ?? "",
  //     reqText ?? "",
  //     skillText,
  //   ]
  //     .filter(Boolean)
  //     .join("\n");

  //   // 3) RAG retrieve with safe error handling
  //   let contexts: Array<any> = [];
  //   try {
  //     const safeTopK = Math.max(1, Math.min(500, topK));
  //     contexts = await this.rag.retrieve(textForQuery, safeTopK);
  //     if (!Array.isArray(contexts)) contexts = [];
  //   } catch (err) {
  //     this.logger?.error?.("RAG retrieve failed in matchCvs:", err);
  //     contexts = [];
  //   }

  //   if (!contexts.length) return { items: [], total: 0, page, limit, pages: 0 };

  //   // 4) Group by CV (robust extracting of sourceId)
  //   const byCv: Record<
  //     string,
  //     { maxScore: number; chunks: any[]; metadata: any }
  //   > = {};

  //   for (const c of contexts) {
  //     let sid = c.metadata?.sourceId ?? null;
  //     if (!sid && typeof (c as any).id === "string") {
  //       const parts = (c as any).id.split("::");
  //       sid = parts[0];
  //     }
  //     if (!sid) continue;

  //     if (!byCv[sid]) {
  //       byCv[sid] = {
  //         maxScore: c.score ?? 0,
  //         chunks: [c],
  //         metadata: c.metadata ?? {},
  //       };
  //     } else {
  //       byCv[sid].maxScore = Math.max(byCv[sid].maxScore, c.score ?? 0);
  //       byCv[sid].chunks.push(c);
  //     }
  //   }

  //   const cvIds = Object.keys(byCv);
  //   if (cvIds.length === 0)
  //     return { items: [], total: 0, page, limit, pages: 0 };

  //   // 5) Load CV documents and build map for O(1) lookup
  //   const cvs = await this.cvModel.find({ _id: { $in: cvIds } }).lean();
  //   const cvsMap = new Map<string, any>(
  //     cvs.map((cv: any) => [String(cv._id), cv]),
  //   );

  //   // 6) Merge into array
  //   let merged = cvIds.map((id) => {
  //     const cvDoc = cvsMap.get(id) ?? { _id: id, missing: true };
  //     return {
  //       cv: cvDoc,
  //       score: byCv[id].maxScore,
  //       metadata: byCv[id].metadata,
  //       chunks: byCv[id].chunks,
  //     };
  //   });

  //   // 7) Sort (tie-breaker: score then cv._id)
  //   merged.sort((a, b) => {
  //     const diff = (b.score ?? 0) - (a.score ?? 0);
  //     if (diff !== 0) return sort === "best" ? diff : -diff;
  //     return String(a.cv._id).localeCompare(String(b.cv._id));
  //   });

  //   // 8) Pagination (safe)
  //   const total = merged.length;
  //   const start = Math.max(0, (page - 1) * limit);
  //   const items = merged.slice(start, start + Math.max(1, limit));

  //   // Normalize cv._id to string for client convenience
  //   const normalizedItems = items.map((it) => ({
  //     cv: { ...it.cv, _id: String(it.cv._id) },
  //     score: it.score,
  //     metadata: it.metadata,
  //     chunks: it.chunks,
  //   }));

  //   return {
  //     items: normalizedItems,
  //     total,
  //     page,
  //     limit,
  //     pages: Math.ceil(total / limit),
  //   };
  // }
}
